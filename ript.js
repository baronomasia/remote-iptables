//Import requirements
var argv = require('minimist')(process.argv.slice(2));
var Datastore = require('nedb');
var exec = require('child_process').exec;
var fs = require('fs');
var prompt = require('prompt');

//Default file paths
var DB_PATH_DEFAULT = 'servers.db';
var GROUPS_DIR = 'security-groups/';
var FOOTER_PATH = GROUPS_DIR + 'default-footer';
var HEADER_PATH = GROUPS_DIR + 'default-header';
//iptables commands
var IPTABLES_CMD = 'iptables'
var IPTABLES_APPLY = 'sudo iptables-save > /etc/sysconfig/iptables';
var IPTABLES_OUTPUT = 'iptables -S';

//Return the usage (help) message
function usage() {
  return [
    'Usage: node ript.js command ...',
    '',
    'remote iptables management',
    '',
    'requires iptables and ssh',
    '',
    'examples',
    '  import server entries from a local file',
    '  for each entry, list hostname, ip, then groups - separated by spaces',
    '  separate each server entry by a carriage return',
    '',
    '    node ript.js -m local_file',
    '',
    '  assign a security group to all servers matching a particular hostname',
    '  create groups files in the security-groups directory',
    '  each line of the group file is an iptables command (e.g. -P INPUT DROP)',
    '  when prompted for a result number, use * to select all',
    '',
    '    node ript.js -a groupname',
    '',
    '  delete a server entry with a particular hostname',
    '',
    '    node ript.js -d hostname',
    '',
    '  update iptables for all server entries with a particular group',
    '  when prompted for a result number, use * to select all',
    '',
    '    node ript.js -u groupname -l ssh-username -i ssh-identityfile',
    '',
    'options',
    '  -a, --assign     assign a securiy group to server entries',
    '  -c, --create     create a new server entry',
    '  -d, --delete     delete a server entry',
    '  -e, --edit       edit a server entry',
    '  -m, --import     import server entries from a file (optional -o flag)',
    '  -o, --overwrite  overwrite all server entries on import (-m only)',
    '  -r, --remove     remove a security group from server entries',
    '  -s, --show       show server entries',
    '  -u, --update     update server entries iptables via ssh',
    '',
    'ssh options (options passed directly to ssh, -u only)',
    '  -i   specify a private key identity file',
    '  -l   specify a user',
    '  -p   specify a port',
  ].join('\n');
}

//Load database
var db = new Datastore({ filename: DB_PATH_DEFAULT, autoload: true });
//Set prompt message
prompt.message = 'Enter';

//If the 'h' (help) parameter is specified, display the usage options
if ('h' in argv) return console.log(usage());

//If the 's' (show) parameter is specified, show relevant server entries
if ('s' in argv || 'show' in argv) {
  console.log('Showing server results: ')
  //If no search term is specified, all servers are shown
  return findServers(getArg('s', 'show')).then(displayResults, console.error);
}
//If the 'g' (generate) parameter is specified, output the iptables command
if ('g' in argv || 'generate' in argv) {
  console.log('Generating iptables commands for server: ')
  var searchTerm = getArg('g', 'generate');
  //Find server(s) matching the search term
  findServers(searchTerm).then(function (results) {
    //Display the server results to the user
    displayResults(results);
    if (results.length <= 0) return;
    //Input schema for selecting a displayed result number
    var schema = { 
      properties: { 
        selection: {
          description: 'result number', 
          pattern: /^\d+$/, 
          message: 'Invalid input', 
          required: true 
        }
      }
    };
    //Get user input based on the above input schema
    getUserInput(schema).then(function (input) {
      var index = input.selection;
      if ( index < 0 | index >= results.length) {
        return console.error('Invalid selection');
      }
      //Output the generated iptables command
      console.log(generateCommands(results[index]['groups']));
    }, console.error);
  }, console.error);
  return;
}

//If the 'c' (create) parameter is specified, create a new server entry
if ('c' in argv || 'create' in argv) {
  console.log('Add a new server:')
  //Input schema for creating a new server
  var schema = {
    properties: { 
      hostname: {
        description: 'hostname', 
        pattern: /^\S+$/,
        message: 'No spaces', 
        required: true 
      },
      ip: {
        description: 'IP',
        pattern: /^(\d+.\d+.\d+.\d+)$/,
        message: 'Invalid IP format',
        required: true
      },
      groups: {
        description: 'groups',
        pattern: /^[\w\-\_\.\ ]+$/,
        message: 'No special characters except - . _',
        required: true
      }
    }
  };
  //Get user input based on the above input schema
  getUserInput(schema).then(function (input) {
    //Format input groups into an array
    var groups = formatGroups(input.groups);
    //Insert the new entry into the database
    db.insert({ hostname: input.hostname, ip: input.ip, groups: groups});
    console.log('New server entry added')
  }, console.error);
  return;
}

//If the 'e' (edit) parameter is specified, edit a server entry
if ('e' in argv || 'edit' in argv) {
  var searchTerm = getArg('e', 'edit');
  //Find server(s) matching the search term
  findServers(searchTerm).then(function (results) {
    //Display the server results to the user
    displayResults(results);
    if (results.length <= 0) return;
    //Input schema for editing a server entry
    var schema = { 
      properties: { 
        selection: {
          description: 'result number', 
          pattern: /^\d+$/, 
          message: 'Invalid input', 
          required: true 
        },
        hostname: {
          description: 'new hostname',
          pattern: /^\S+$/,
          message: 'No spaces', 
          required: false,
          ask: function() {
            var index = prompt.history('selection').value;
            return index >= 0 && index < results.length; 
          }
        },
        ip: {
          description: 'new IP',
          pattern: /^(\d+.\d+.\d+.\d+)$/,
          message: 'Invalid IP format',
          required: false,
          ask: function() {
            var index = prompt.history('selection').value;
            return index >= 0 && index < results.length; 
          }
        },
        groups: {
          description: 'new groups',
          pattern: /^[\w\-\_\.\ ]+$/,
          message: 'No special characters except - . _',
          required: false,
          ask: function() {
            var index = prompt.history('selection').value;
            return index >= 0 && index < results.length; 
          }
        }
      }
    };
    //Get user input based on the above input schema
    getUserInput(schema).then(function (input) {
      var index = input.selection;
      if (index < 0 || index >= results.length) {
        return console.error('Invalid selection');
      } 
      //Save edited host, ip, and groups to local variables
      var host = input.hostname;
      var ip = input.ip;
      var groups = input.groups;
      //If nothing was entered for all 3 input fields, do not update the db
      if (host == '' && ip == '' && groups == '') {
        return console.log('No changes made');
      }
      //If nothing entered for individual fields, set to original value
      if (host == '') host = results[index]['hostname'];
      if (ip == '') ip = results[index]['ip'];
      if (groups == '') groups = results[index]['groups'];
      //Format input groups into an array
      else groups = formatGroups(groups);
      //Update the edited server entry
      db.update({ _id: results[index]['_id'] }, 
        { $set: { hostname: host, ip: ip, groups: groups } });
      console.log('Entry updated to: ' + host + '  ' + ip + '  ' + groups);
    }, console.error);
  }, console.error);
  return;
}

//If the 'a' (assign) parameter is specified, assign a group to server entries
if ('a' in argv || 'assign' in argv) {
  console.log('Select server(s) to assign a security group to:');
  var searchTerm = getArg('a', 'assign');
  //Find server(s) matching the search term
  findServers(searchTerm).then(function (results) {
    //Display the server results to the user
    displayResults(results);
    if (results.length <= 0) return;
    //Input schema for assigning a group
    var schema = {
      properties: { 
        selection: {
          description: 'result number', 
          pattern: /^\d+$|^\*$/,
          message: 'Invalid input', 
          required: true, 
        },
        group: {
          description: 'group name',
          pattern: /^[\w\-\_\.]+$/,
          message: 'No special characters except - . _',
          required: false,
        }
      }
    };
    //Get user input based on the above input schema
    getUserInput(schema).then(function (input) {
      var index = input.selection;
      if ((index < 0 || index >= results.length) && index != '*') {
        return console.error('Invalid selection');
      }
      //Assign the to-be-assigned group to a local variable
      var group = input.group;
      //If a single entry is specified, assign the new group to only that entry
      if (index != '*') {
        var groups = results[index]['groups'];
        groups.push(group);
        db.update({ _id: results[index]['_id'] }, { $set: { groups: groups } });
      } else {
        //If all entries are specified, assign the new group to all results
        for(i=0; i<results.length; i++) {
          var groups = results[i]['groups'];
          groups.push(group);
          db.update({ _id: results[i]['_id'] }, { $set: { groups: groups } });
        }
      }
      console.log('Added ' + group + ' to the specified entries')
    }, console.error);
  }, console.error);
  return;
}

//If the 'r' (remove) parameter is specified, remove a group from server entries
if ('r' in argv || 'remove' in argv) {
  console.log('Select server(s) to remove a security group from:');
  var searchTerm = getArg('r', 'remove');
  //Find server(s) matching the search term
  findServers(searchTerm).then(function (results) {
    //Display the server results to the user
    displayResults(results);
    if (results.length <= 0) return;
    //Input schema for removing a gruop
    var schema = {
      properties: { 
        selection: {
          description: 'result number', 
          pattern: /^\d+$|^\*$/,
          message: 'Invalid input', 
          required: true, 
        },
        group: {
          description: 'group name',
          pattern: /^[\w\-\_\.]+$/,
          message: 'No special characters except - . _',
          required: false,
        }
      }
    };
    //Get user input based on the above input schema
    getUserInput(schema).then(function (input) {
      var index = input.selection;
      if ((index < 0 || index >= results.length) && index != '*') {
        return console.error('Invalid selection');
      }
      //Assign the to-be-assigned group to a local variable
      var group = input.group;
      //If a single entry is specified, assign the new group from only that entry
      if (index != '*') {
        var groups = results[index]['groups'];
        var groupIndex = groups.indexOf(group)
        if (groupIndex > -1) {
          groups.splice(groupIndex, 1);
          db.update({ _id: results[index]['_id'] }, { $set: { groups: groups } });
        }
      } else {
        //If all entries are specified, remove the new group from all results
        for(i=0; i<results.length; i++) {
          var groups = results[i]['groups'];
          var groupIndex = groups.indexOf(group)
          if (groupIndex > -1) {
            groups.splice(groupIndex, 1);
            db.update({ _id: results[i]['_id'] }, { $set: { groups: groups } });
          }
        }
      }
      console.log('Removed ' + group + ' from the specified entries')
    }, console.error);
  }, console.error);
  return;
}

//If the 'd' (delete) parameter is specified, delete the specified entries
if ('d' in argv || 'delete' in argv) {
  console.log('Select server(s) to delete:');
  var searchTerm = getArg('d', 'delete');
  //Find server(s) matching the search term
  findServers(searchTerm).then(function (results) {
    //Display the server results to the user
    displayResults(results);
    if (results.length <= 0) return;
    //Input schema for deleting an entry or entries
    var schema = {
      properties: { 
        selection: {
          description: 'result number', 
          pattern: /^\d+$|^\*$/,
          message: 'Invalid input', 
          required: true, 
        },
        confirm: {
          description: 'y/n to confirm deletion',
          pattern: /yes|no|y|n/i,
          message: 'Invalid input',
          required: true,
          ask: function() {
            var index = prompt.history('selection').value;
            return (index >= 0 && index < results.length || index == '*');
          }
        }
      }
    };
    //Get user input based on the above input schema
    getUserInput(schema).then(function (input) {
      var index = input.selection;
      if ((index < 0 || index >= results.length) && index != '*') {
        return console.error('Invalid selection');
      }
      //Check if the deletion of the entry/ies is confirmed
      var confirm = input.confirm.toLowerCase();
      if (confirm == 'n' || confirm == 'no') {
        return console.log('No entries deleted');
      }
      //Default db search syntax for multiple entries
      var searchSyntax = { $or: [{ hostname: searchTerm }, { ip: searchTerm }, 
        { groups: { $elemMatch: searchTerm } }] };
      var multi = { multi: true };
      //db search syntax for a single entry
      if (index != '*') {
        searchSyntax = { _id: results[index]['_id'] };
        multi = { multi: false };
      }
      //Delete the entry
      db.remove(searchSyntax, multi, function (err, numRemoved) {
        return console.log('Deleted ' + numRemoved + ' entries');
      });
    }, console.error);
  }, console.error);
  return;
}

//If the 'u' (update) parameter is specified, update server entries iptables
if ('u' in argv || 'update' in argv) {
  console.log('Select server(s) to apply iptables update');
  var searchTerm = getArg('u', 'update');
  //Find server(s) matching the search term
  findServers(searchTerm).then(function (results) {
    //Display the server results to the user
    displayResults(results);
    if (results.length <= 0) return;
    //Input schema for deleting an entry or entries
    var schema = {
      properties: { 
        selection: {
          description: 'result number', 
          pattern: /^\d+$|^\*$/,
          message: 'Invalid input', 
          required: true, 
        },
        confirm: {
          description: 'y/n to confirm applying iptables update',
          pattern: /yes|no|y|n/i,
          message: 'Invalid input',
          required: true,
          ask: function() {
            var index = prompt.history('selection').value;
            return (index == '*' || index >= 0 && index < results.length);
          }
        }
      }
    };
    //Get user input based on the above input schema
    getUserInput(schema).then(function (input) {
      var index = input.selection;
      if ((index < 0 || index >= results.length) && index != '*') {
        return console.error('Invalid selection');
      }
      //Check if the update of the entry/ies is confirmed
      var confirm = input.confirm.toLowerCase();
      if (confirm == 'n' || confirm == 'no') {
        return console.log('No servers updated');
      }
      //Construct the first part of the ssh command
      var sshBase = constructBaseSSHCmd();
      //If multiple entries are selected, generate/send ssh commands to each
      if (index == '*') {
        for (i=0; i<results.length; i++) {
          var iptablesCmds = generateCommands(results[i]['groups']);
          var sshCmd =  sshBase + ' ' + results[i]['ip'] +  ' ' + iptablesCmds;
          executeCommand(sshCmd, formatOutput, results[i]['hostname']);
        }
      } else {
        //If a single entry is selected, generate/send the 1 ssh command
        var iptablesCmds = generateCommands(results[index]['groups']);
        var sshCmd =  sshBase + ' ' + results[index]['ip'] +  ' ' + iptablesCmds;
        executeCommand(sshCmd, formatOutput, results[index]['hostname']);
      }
    }, console.error);
  }, console.error);
  return;
}

//If the 'm' (import) parameter is specified, import server entries from a file
if ('m' in argv || 'import' in argv) {
  var filepath = getArg('m', 'import')
  //Display an error if no file is specified
  if (filepath == true) return console.error('No import file specified');
  //If the 'o' (overwrite) parameter is specified, delete all current entries
  if ('o' in argv || 'overwrite' in argv) {
    //Input schema for overwriting all existing entries
    var schema = {
      properties: {
        confirm: {
          description: 'y/n to confirm deleting all existing entries before import',
          pattern: /yes|no|y|n/i,
          message: 'Invalid input',
          required: true
        }
      }
    };
    //Get user input based on the above input schema
    getUserInput(schema).then(function (input) {
      //Check if the update of the entry/ies is confirmed
      if (input == 'no' | input == 'n') return console.log('No changes made');
      //Delete all existing server entries
      db.remove({ }, { multi: true }, function (error, numRemoved) {
        if (error) return console.error(error);
        console.log('Deleted all entries');
        //Load an empty database
        db.loadDatabase(function (error) {
          if (error) return console.error(error);
        });
        //Import server entries from a file
        importServerEntries(filepath);
      });
    }, console.error);
  } else {
    //Import server entries from a file
    importServerEntries(filepath);
  }
  return;
}

//Concatenates iptables rules with the proper initial command
function concatRules(rules) {
  var commands = '';
  for (i in rules) {
    commands = commands + ' && ' + IPTABLES_CMD + ' ' + rules[i];
  }
  return commands;
}

/** Constructs the ssh command without the username or address and with the
  * optional parameters -i and -p if they were specified by the user. */
function constructBaseSSHCmd() {
  var sshCmd = 'ssh';
  //If the identity (i) parameter is specified, append it to the ssh command
  if ('i' in argv) sshCmd = sshCmd + ' -i ' + argv['i'];
  //If the user (l) parameter is specified, append it to the ssh command
  if ('l' in argv) sshCmd = sshCmd + ' -l ' +argv['l'];
  //If the port (p) parameter is present, append it to the ssh command
  if ('p' in argv) sshCmd = sshCmd + ' -p ' + argv['p'];
  return sshCmd;
}

//Displays server entry results to the user
function displayResults(results) {
  if (results.length == 0) return console.log('No results found');
  for(i in results) {
    console.log('[' + i + ']  ' + results[i]['hostname'] + '  ' + 
      results[i]['ip'] + '  ' + results[i]['groups']);
  }
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

//Finds servers matching a search term. If search term true, returns all entries
function findServers(searchTerm) {
  //Db operations are aynschronous, using promise to notify instead of callback
  return new Promise(function (fulfill, reject) {
    var searchSyntax = { $or: [{ hostname: searchTerm }, { ip: searchTerm }, 
      { groups: { $elemMatch: searchTerm } }] };
    //If no search term is specified, argv defaults the search term to true
    if (searchTerm == true) searchSyntax = {};
    db.find(searchSyntax, function (error, results) {
      if (error) reject(error);
      else fulfill(results);
    });
  });
}

//Formats user input groups into an array
function formatGroups(groups) {
  return groups.replace(/ +(?= )/g,'').split(' ');
}

//Processes and formats the ssh output so it is easily readable by the user
function formatOutput(output, sshAddress) {
  output = output.toString().replace(/^\s*[\r\n]/gm,'').trim().split('\n');
  for (i=0; i<output.length; i++) {
    console.log('[' + sshAddress + ']: ' + output[i]);
  }
  console.log('\r');
}

//Generates iptables commands from an array of gruops
function generateCommands(groups) {
  //Using a header of default accepts to avoid rules ordering conflicts
  var commands = IPTABLES_CMD + ' -F' + concatRules(fileToArray(HEADER_PATH));
  for (i in groups) {
    commands = commands + concatRules(fileToArray(GROUPS_DIR + groups[i]));
  }
  //Using a footer of default denies to avoid rule ordering conflicts
  commands = commands + concatRules(fileToArray(FOOTER_PATH));
  //Concatenate last commands (apply changes and output rules)
  var lastCommands = IPTABLES_APPLY + ' && ' + IPTABLES_OUTPUT;
  return '"' + commands + ' && ' + lastCommands + '"';
}

//Takes two argv parameters and returns the value of one of them
function getArg(arg1, arg2) {
  if (arg1 in argv) return argv[arg1];
  if (arg2 in argv) return argv[arg2];
}

//Prompts the user for input based on input schema
function getUserInput(schema) {
    //User input is aynschronous, using promise to notify instead of callback
  return new Promise(function (fulfill, reject) {
    prompt.start();
    prompt.get(schema, function (error, input) {
      if (error) reject(error);
      else fulfill(input);
    });
  });
}

//Imports server entries from a file
function importServerEntries(filename) {
  var servers = fileToArray(filepath);
  for (i in servers) {
    //Fields in each entry are separated by a space
    var server = servers[i].split(' ');
    var hostname = server[0];
    var ip = server[1];
    //Use splice to separate groups from hostname and ip
    server.splice(0, 2);
    var groups = server;
    //Add the server entry to the database
    db.insert({ hostname: hostname, ip: ip, groups: groups});
  }
  console.log('Successfully imported ' + servers.length + ' servers')
}