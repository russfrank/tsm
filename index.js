// tsm - Titanium SDK Manager
// This file contains functions for retreiving builds & build metadata from
// Appcelerator.  Tests are in `test.js`.

var request = require("request");
var async = require("async");
var semver = require("semver");
var fs = require("fs");
var path = require("path");
var util = require("util");
var EventEmitter = require("events").EventEmitter;

var branchesURL = 
  'http://builds.appcelerator.com.s3.amazonaws.com/mobile/branches.json';
var branchURL = 
  'http://builds.appcelerator.com.s3.amazonaws.com/mobile/$BRANCH/index.json';

// zipURL needs branch/zipname added to it
var zipURL = 'http://builds.appcelerator.com.s3.amazonaws.com/mobile/';

var tsm = {};
module.exports = tsm;

// ### gitCheck
// * `input` some partial hash
// * `revision` some git revision hash
// Checks to see if the given input matches the given hash
tsm.gitCheck = function (input, revision) {
  if (input && input.length > 1 && revision.indexOf(input) === 0) return true;
  else return false;
};

// ### getBranches
// * `done` callback to be called when complete, passed `(error, data)`
// Gets a list of branches from Appcelerator, formatted as an array of strings
tsm.getBranches = function (done) {
  request(branchesURL, function (error, response, body) {
    try {
      if (error) throw error;

      var data = JSON.parse(body).branches;
      if (!data) throw new Error("got malformed response from appcelerator");

      done(null, data);
    } catch (e) { done(e); }
  });
};

// ### parseDate
// * `dateStr` string to parse date out of
// Parses dates from the strange way Appcelerator chooses to format them.
// Returns a date object.
tsm.parseDate = function (dateStr) {
  var date = new Date();

  // date parsing code stolen right off of builds.appcelerator.net
  date.setFullYear(
    dateStr.substring(0,4), dateStr.substring(4,6)-1, dateStr.substring(6,8));
  date.setHours(dateStr.substring(8, 10));
  date.setMinutes(dateStr.substring(10,12));
  date.setSeconds(dateStr.substring(12,14));

  return date;
};

// ### parseBuildList
// * `input` version or git hash to match against builds, can be falsy
// * `os` should be 'linux' or 'osx' or 'win32'
// * `builds` array of builds to parse
// Parses a build list from appcelerator, matching only those builds we're
// interested in. Returns a list of builds formatted like:

//     [
//       {
//         date: date object corresponding to build date,
//         version: version string like '2.2.0',
//         zip: zip url,
//         git_revision: git hash,
//         githash: short git hash (first 7 chars),
//         sha1: sha1 hash of file,
//         size: size in bytes,
//         git_branch: git branch name,
//         build_type: mobile or desktop,
//         filename: basename ie 'mobilesdk-2.2.0-version.zip',
//         build_url: jenkins url
//       },
//       ...
//     ]

tsm.parseBuildList = function (input, os, builds) {
  return builds.filter(function (item) { 
    if (os && item.filename.indexOf(os) === -1) return false;

    item.version = item.filename.match(/[0-9]*\.[0-9]*\.[0-9]*/)[0];
    var dateStr = item.filename.match(/[0-9]{14}/)[0];
    item.date = tsm.parseDate(dateStr);
    item.zip = zipURL + item.git_branch + "/" + item.filename;
    item.githash = item.git_revision.slice(0, 7);

    // Shouldn't fail unless they change something..
    if (!item.version || !dateStr) {
      console.error("couldn't get version / date from " + item.filename);
      return false;
    }

    var satisfied;
    if (input) satisfied = (
      semver.satisfies(item.version, input) || 
      tsm.gitCheck(input, item.git_revision)
    );

    // If there's no input, or if there is input and it was satisfied, this
    // item 'passes'
    if (!input || (input && satisfied)) return true;

    return false;
  });
};

// ### getBuilds
// * `branch` branch to get builds for
// * `done` callback function called with `(error, builds)`
// Get the list of builds for a particular branch
tsm.getBuilds = function (branch, done) {
  var url = branchURL.replace('$BRANCH', branch);
  request(url, function (error, response, body) { 
    try {
      if (error) throw error;
      var data = JSON.parse(body);
      done(null, data);
    } 
    
    catch (e) { done(error); }
  });
};

// ### getAllBuilds
// * `input` git hash or version to match
// * `os` os to match, should be 'linux' or 'osx' or 'win32'
// * `done` callback function, called with `(error, builds)`
// Gets all builds matching the input query.  Input can be undefined in which
// case we return all builds.
tsm.getAllBuilds = function (input, os, done) {
  tsm.getBranches(function (error, branches) {
    async.reduce(branches, [], function (memo, item, callback) {
      tsm.getBuilds(item, function (error, builds) {
        if (error) callback(error);
        else callback(null, memo.concat(builds));
      });
    }, function (error, result) {
      // Sort and return
      if (error) return done(error);

      result = tsm.parseBuildList(input, os, result);
      result.sort(function (a, b) {
        return a.date.getTime() - b.date.getTime();
      });

      done(null, result);
    });
  });
};

// ### parseVersionFile
// * `data` version file text 
// Parses the text of a version.txt file and returns it
tsm.parseVersionFile = function (data) {
  return data.split('\n').reduce(function (memo, item) { 
    if (!item) return memo;
    item = item.split('=');
    memo[item[0]] = item[1];
    return memo;
  }, {});
};

// ### examineDir
// * `dir` directory to examine
// * `done` callback called with `(error, data)`
// Tries to get the version.txt file in a directory.  If it isn't found or it
// doesn't appear to have the correct properties, an error is returned.
tsm.examineDir = function (dir, done) {
  fs.readFile(path.join(dir, 'version.txt'), 'utf8', function (error, data) {
    if (error) return done(error);
    data = tsm.parseVersionFile(data);
    if (!data.githash || !data.version || !data.timestamp)
      done(new Error('dir does not appear to contain a valid sdk'));
    else done(null, data);
  });
};

// ### findInstalled
// * `dir` directory to examine
// * `input` git hash or version to match
// * `done` callback function, called with `(error, builds)`
// Finds installed versions. Returns an emitter which may emit 'debug' and 'log'
// events.
tsm.findInstalled = function (dir, input, done) {
  var emitter = new EventEmitter();
  fs.readdir(dir, function (error, versions) {
    if (error) return done(error);
    emitter.emit("debug", "examining directories: " + versions.join(','));
    async.reduce(versions, [], function (memo, version, callback) {
      tsm.examineDir(path.join(dir, version), function (error, build) {
        if (error) return callback(null, memo);

        emitter.emit("debug", "got data for version: " + version);

        var satisfied;
        if (input) satisfied = (
          semver.satisfies(build.version, input) || 
          tsm.gitCheck(input, build.githash)
        );

        if (!input || (input && satisfied)) {
          emitter.emit("debug", version + "is satisfied, returning it");
          memo.push({
            githash: build.githash,
            version: build.version,
            date: new Date(build.timestamp)
          });
        }

        callback(null, memo);
      });
    }, function (error, data) {
      if (error) return done(error);

      data.sort(function (a, b) {
        return a.date.getTime() - b.date.getTime();
      });
      done(null, data);
    });
  });
  return emitter;
};

// ### mergeBuilds
// * `available` uninstalled but available builds
// * `installed` builds assumed to already be on the user's system
// Merges one list of available builds and one list of installed builds
tsm.mergeBuilds = function (available, installed) {

  // Setup a mapping of git hashes to build objects.
  var installedByHash = {};
  installed.forEach(function (build) { 
    installedByHash[build.githash] = build; 
  });

  // We'll loop over the available builds and delete builds from the
  // installedByHash object when we encounter them. That way, any builds not
  // present in the installed list but present in the available list will still
  // be in the installedByHash object at the end and we can simply drop those
  // on the end of the available list and return it.

  available = available.map(function (build) {
    if (installedByHash[build.githash]) build.installed = true;
    else build.installed = false;

    delete installedByHash[build.githash];
    return build;
  });

  Object.keys(installedByHash).forEach(function (hash) {
    var build = installedByHash[hash];
    build.installed = true;
    available.push(build);
  });

  available.sort(function (a, b) {
    return a.date.getTime() - b.date.getTime();
  });

  return available;
};

// ### list
// * `options` object, can have the following properties:
//   * `os` string *required* os of builds, one of 'osx' 'linux' 'win32'
//   * `installed` boolean, whether or not to include installed builds
//   * `available` boolean, whether or not to include uninstalled builds
//   * `dir` string, directory to look for installed builds
//   * `input` string, git hash or version to match
// * `done` callback called on completion with `(error, builds)`
// The complete solution for listing builds. Returns an EventEmitter which will
// emit 'log' and 'debug' events.

tsm.list = function (options, done) {
  if (typeof options.os !== 'string') 
    throw new TypeError("options.os is required");
  if (options.installed && typeof options.dir != 'string')
    throw new TypeError("options.dir is required for options.installed");

  async.parallel({
    installed: function (callback) {
      if (!options.installed) callback(null, []);
      else tsm.findInstalled(options.dir, options.input, callback);
    },

    available: function (callback) {
      if (!options.available) callback(null, []);
      else tsm.getAllBuilds(options.input, options.os, callback);
    }
  }, function (error, data) {
    if (error) callback(error);
    else callback(null, tsm.mergeBuilds(data.available, data.installed));
  });
};
