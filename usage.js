require('colors');

usage =[
"   __    ".yellow.bold,
"  / /__________ ___ ".yellow.bold,
" / __/ ___/ __ `__ \\".yellow.bold,
"/ /_(__  ) / / / / /".yellow.bold,
"\\__/____/_/ /_/ /_/ ".yellow.bold,
"",
"Titanium SDK Manager".blue.bold,
"http://github.com/russfrank/tsm",
"Version " + require(__dirname + "/package").version,
"",
"Usage:".underline,
"",
"    tsm <command> <args*>".red.bold,
"",
"Commands:".underline,
"",
"    tsm ls <all|installed> <version>".bold,
"",
"    List installed SDK versions. <version> is optional; if ommitted, all",
"    builds will be listed.",
"",
"    tsm delete <version>".bold,
"",
"    Delete matching SDK versions. Will prompt for confirmation first.",
"",
"    Alias: ".bold + "d",
"",
"    tsm install <version>".bold,
"",
"    Installs latest SDK matching <version>.",
"",
"    Aliases: ".bold + "i",
"",
"    tsm show <version>".bold,
"",
"    Displays info about a single matched build. This is the build that will ",
"    be used with this <version> argument when using one of the single build",
"    commands like run or builder.",
"",
"    Aliases: ".bold + "s info",
"",
"    tsm run <version> <args*>".bold,
"",
"    Run the " + "titanium.py".bold + " script bundled with the specified SDK",
"    version.  args* will be passed to the " + "titanium.py".bold+ " script.",
"",
"    tsm builder <version> <os>".bold,
"",
"    Run the "+"builder.py".bold+"} for the os specified bundled with the",
"    specified SDK version.  <os> should be one of [iphone, android].",
"",
"Versions are parsed with node-semver, so ranges can be specified.  If multiple",
"versions match, the latest build (sorted by date) will be used. Git hash ",
"partials can also be used to specify a version.",
"",
"Examples:".underline,
"",
"    tsm ls installed 2".bold + "  list installed builds matching 2",
"    tsm install 2.2".bold + "     install the latest build matching 2.2",
"    tsm run cde5b27".bold + "     run the titanium.py script for build with hash cde5b27",
"    tsm info 2.2.1".bold + "      print info about the latest installed build of 2.2.1",
""
].join('\n');

module.exports = usage;
