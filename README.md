#### Remote iptables (ript.js)

An iptables remote management tool.

#### Requirements

* Node.js
* diff, grep, iptables, printf, ssh

#### Installation

```
git clone https://github.com/baronomasia/remote-iptables.git
cd remote-iptables
npm install
```

#### Usage

Usage: node ript.js [-i identity_file] [-p port] command ...

Export the iptables policy of a remote server to a local file
 
    node ript.js -e user@remotehost -f local_file -i identity_file
 
Apply an iptables policy to a group of host addresses;
  list host addresses separated by a carriage return in a file

    node ript.js -a policy_file -g group_file -l user -i identity_file

options  
&nbsp;&nbsp;-a &nbsp;&nbsp;apply an iptables policy to a group of servers, requires -g, -l  
&nbsp;&nbsp;-e &nbsp;&nbsp;export the iptables of a remote server to a local file  
&nbsp;&nbsp;-f &nbsp;&nbsp;optionally specify the exported iptables filename (-e only)  
&nbsp;&nbsp;-g &nbsp;&nbsp;specify the file containing the group of servers, required for -a  
&nbsp;&nbsp;-h &nbsp;&nbsp;display these usage options and exit  
&nbsp;&nbsp;-l &nbsp;&nbsp;specify the ssh username for a group of servers, required for -a  
&nbsp;&nbsp;-v &nbsp;&nbsp;optionally enable verbose mode  
&nbsp;&nbsp;-w &nbsp;&nbsp;optionally whitelist a group of servers (filename, -a only)

ssh options (options passed directly to ssh)  
&nbsp;&nbsp;-i &nbsp;&nbsp;specify a private key identity file  
&nbsp;&nbsp;-p &nbsp;&nbsp;specify a port
  