//Import requirements
var argv = require('minimist')(process.argv.slice(2));
var exec = require('child_process').exec;
var fs = require('fs');

//Default filename constant
var FILENAME_DEFAULT = 'exported-iptables';
//Remote path constants
var PATH_ORIGINAL_RULES = '~/iptables-original';
var PATH_DESIRED_RULES = '~/iptables-desired';

//Return the usage (help) message
function usage() {
  return [
    'Usage: node ript.js [-i identity_file] [-p port] command ...',
    '',
    'remote iptables management',
    '',
    'requires diff, grep, iptables, printf, and ssh',
    '',
    'examples',
    '  export the iptables policy of a remote server to a local file',
    '',
    '    node ript.js -e user@remotehost -f local_file -i identity_file',
    '',
    '  apply an iptables policy to a group of host addresses;',
    '  list host addresses separated by a carriage return in a file',
    '',
    '    node ript.js -a policy_file -g group_file -l user -i identity_file',
    '',
    'options',
    '  -a   apply an iptables policy to a group of servers, requires -g, -l',
    '  -e   export the iptables of a remote server to a local file',
    '  -f   optionally specify the exported iptables filename (-e only)',
    '  -g   specify the file containing the group of servers, required for -a',
    '  -h   display these usage options and exit',
    '  -l   specify the ssh username for a group of servers, required for -a',
    '  -v   optionally enable verbose mode',
    '  -w   optionally whitelist a group of servers (filename, -a only) ',
    '',
    'ssh options (options passed directly to ssh',
    '  -i   specify a private key identity file',
    '  -p   specify a port',
  ].join('\n');
}

//If the 'h' (help) parameter is specified, display the usage options
if ('h' in argv) return console.log(usage());

/** If the 'e' (export) parameter is specified, verify and process all related
*   parameters and export iptables rules to an optionally specified file. */ 
if ('e' in argv) {
  var sshAddress = argv['e']
  if (sshAddress.indexOf('@')<0) {
    return console.log('Error parsing ssh user and address');
  }
  //Check if optional filename is specified, use default otherwise
  var filename = FILENAME_DEFAULT;
  if ('f' in argv) filename = argv['f'];
  //Create the base ssh command with specified optional parameters included
  var sshCmd = constructBaseSSHCmd();
  //Execute ssh comand to list all firewall rules, then save output to file
  sshCmd = sshCmd + ' ' + sshAddress + ' sudo iptables-save';
  executeCommand(sshCmd, outputToFile, filename);
}

/** If the 'a' (apply) parameter is specified, verify and process all related
  * parameters and run constructed ssh command on specified servers. */
if ('a' in argv && fs.lstatSync(argv['a']).isFile()) {
  //Import the firewall rules from the file to an array
  var desiredRules = fs.readFileSync(argv['a'], 'utf8').toString();
  //Throw error if group file is not specified or invalid
  if (!('g' in argv && fs.lstatSync(argv['g']).isFile())) {
    return console.log('No group specified');
  } else {
    //Reads the server IP addresses from the group file
    var serverAddresses = fileToArray(argv['g']);
    if ('w' in argv && fs.lstatSync(argv['w']).isFile()) { 
      serverAddresses = whitelist(serverAddresses);
    }
    //Create the parts of the ssh command shared between all servers
    var sshCmdStart = constructBaseSSHCmd();
    var sshCmdEnd = constructIptablesCmd(desiredRules);
    //Throw error and exit if user is not specified
    if (!('l' in argv)) return console.log("Error no ssh user specified");
    //Loop through server list and apply the constructed ssh command
    for (i=0; i<serverAddresses.length; i++) {
      var sshAddress = argv['l'] + '@' + serverAddresses[i]
      var sshCmd = sshCmdStart + ' ' + sshAddress + ' ' + sshCmdEnd;
      executeCommand(sshCmd, formatOutput, serverAddresses[i]);
    }
  }
}

/** Constructs the ssh command without the username or address and with the
  * optional parameters -i and -p if they were specified by the user. */
function constructBaseSSHCmd() {
  var sshCmd = 'ssh';
  //If the identity (i) parameter is specified, append it to the ssh command
  if ('i' in argv && fs.lstatSync(argv['i']).isFile()) {
    sshCmd = sshCmd + ' -i ' + argv['i'];
  }
  //If the port (p) parameter is present, append it to the ssh command
  if ('p' in argv) sshCmd = sshCmd + ' -p ' + argv['p'];
  return sshCmd
}

/** Constructs the chained command to check and (if needed) update the iptables
  * on the remote server. Takes the desired iptables config (desiredRules) */
function constructIptablesCmd(desiredRules) {
  //Copy desired rules from program memory to a file on the server
  var copyDesiredRules = 'printf "'+ desiredRules + '" > ' + 
    PATH_DESIRED_RULES;
  //Save server iptables (no comments or counters) to a file on the server
  var exportCurrentRules = 'sudo iptables-save | grep -o "^[^#][^[]*" > ' +
    PATH_ORIGINAL_RULES;
  //Diff (comparison) of the desired and actual iptables configuration
  var compareRules = 'diff -qB '+ PATH_ORIGINAL_RULES + ' ' +
    PATH_DESIRED_RULES;
  var notifySame = 'printf "iptables match. No update needed."';
  var notifyDifferent = 'printf "iptables do not match. Updating iptables."';
  //Outputs the diff of the two files
  var notifyChanges = 'printf "$(diff -B ' + PATH_ORIGINAL_RULES + ' ' +
    PATH_DESIRED_RULES + ')"';
  //Applies the desired iptables configuration
  var applyRules = 'sudo iptables-restore < ' + PATH_DESIRED_RULES;
  //Checks if an update needs to be applied and if needed, applies it
  var checkApplyRules = 'if ' + compareRules + ' > /dev/null; then ' +
   notifySame + '; else ' + notifyDifferent;
  //If verbose mode is on, additionally include the diff output
  if ('v' in argv) checkApplyRules = checkApplyRules + ' && ' + notifyChanges;
  checkApplyRules = checkApplyRules + ' && ' + applyRules + '; fi';
  //Chain commands together and return
  return "'" + copyDesiredRules + ' && ' + exportCurrentRules + ' && ' +
    checkApplyRules + "'";
}

/** Executes the command parameter. If no error is produced, successFunction
  * is called with the command output and successArg parameters */
function executeCommand(command, successFunction, successArg) {
  //Execute the given ssh command
  exec(command, function(error, stdout, stderr) {
    //Check for errors
    if (error != null) return console.log(error);
    if (stderr.length != 0) return console.log(stderr);
    //If no errors, execute successFunction
    successFunction(stdout, successArg);
  });
}

//Takes a filepath and outputs an array (ignores blank lines and returns)
function fileToArray(path) {
  return fs.readFileSync(path, 
    'utf8').toString().replace(/^\s*[\r\n]/gm,'').trim().split('\n');
}

//Processes and formats the ssh output so it is easily readable by the user
function formatOutput(output, sshAddress) {
  output = output.toString().replace(/^\s*[\r\n]/gm,'').trim().split('\n');
  for (i=0; i<output.length; i++) {
    console.log('[' + sshAddress + ']: ' + output[i]);
  }
  console.log('\r');
}

//Takes output and saves it to a file with the name designated by filename
function outputToFile(output, filename) {
  //Remove comments (lines starting with #) and counters ([0:0])
  output = output.toString().replace(/\[(.*?)\]|#.*\n/g, '');
  fs.writeFile(filename, output, function(err) {
    if(err) return console.log(err);
    return console.log('Output sucessfully saved to ' + filename);
  });
}

//Removes whitelisted servers from the list of target servers
function whitelist(targetServers) {
  var whitelist = fileToArray(argv['w']);
  for (i=0; i<targetServers.length; i++) {
    if (whitelist.indexOf(targetServers[i]) > -1) {
      if ('v' in argv) console.log("Whitelisting " + targetServers[i])
      targetServers.splice(i,1);
    }
  }
  return targetServers;
}