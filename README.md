#### Remote iptables (ript.js)

An iptables remote management tool.

#### Requirements

* Node.js
* iptables and ssh

#### Installation

```
git clone https://github.com/baronomasia/remote-iptables.git
cd remote-iptables
npm install
```

#### Usage

Usage: node ript.js command ...

  Import server entries from a local file  
  For each entry list hostname ip then groups - separated by spaces  
  Separate each server entry by a carriage return  

    node ript.js -m local_file

  Assign a security group to all servers matching a particular hostname  
  Create groups files in the security-groups directory  
  Each line of the group file is an iptables command (e.g. -P INPUT DROP)  
  When prompted for a result number use * to select all

    node ript.js -a groupname

  Delete a server entry with a particular hostname

    node ript.js -d hostname

  Update iptables for all server entries with a particular group  
  When prompted for a result number use * to select all

    node ript.js -u groupname -l ssh-username -i ssh-identityfile

options  
  -a --assign&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;assign a securiy group to server entries  
  -c --create&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;create a new server entry  
  -d --delete&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;delete a server entry  
  -e --edit&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;edit a server entry  
  -m --import&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;import server entries from a file (optional -o flag)  
  -o --overwrite&nbsp;&nbsp;overwrite all server entries on import (-m only)  
  -r --remove&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;remove a security group from server entries  
  -s --show&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;show server entries  
  -u --update&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;update server entries iptables via ssh  

ssh options (options passed directly to ssh, -u only)  
&nbsp;&nbsp;-i &nbsp;&nbsp;specify a private key identity file  
&nbsp;&nbsp;-l &nbsp;&nbsp;specify a user  
&nbsp;&nbsp;-p &nbsp;&nbsp;specify a port  