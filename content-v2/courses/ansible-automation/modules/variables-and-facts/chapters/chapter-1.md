# Chapter 1: Variables, Secrets, and Facts in Ansible

Ansible automates complex environments by separating configuration logic from host-specific values. When deploying web services, database clusters, and firewall rules, hard-coding IPs, credentials, or file paths makes automation fragile and insecure.

In this chapter, you will learn how Ansible handles dynamic host data using variables, facts, and Ansible Vault.

---

## 1. Defining and Using Variables

Variables provide a way to reuse values throughout plays and tasks. In an Ansible Playbook, you can define variables directly under the `vars:` directive of a play:

```yaml
---
- name: Deploy Secure Web Server
  hosts: webserver
  vars:
    web_pkg: httpd
    web_svc: httpd
    web_root: /var/www/html
```

You reference variables using Jinja2 syntax: `{{ variable_name }}`. When a variable reference starts a line or is a value in YAML, enclose it in quotes:

```yaml
  tasks:
    - name: Ensure web document root exists
      ansible.builtin.file:
        path: "{{ web_root }}"
        state: directory
        owner: apache
        group: apache
        mode: '0755'
```

---

## 2. Using Ansible Facts

Ansible automatically discovers host facts before executing tasks by running the `setup` module. Facts contain critical runtime information, including:
- `ansible_facts['fqdn']`: Fully qualified domain name
- `ansible_facts['hostname']`: Short host name
- `ansible_facts['default_ipv4']['address']`: Default IPv4 address
- `ansible_facts['os_family']`: Operating system family (e.g., RedHat)

You can use facts dynamically in tasks to customize files or configurations per host:

```yaml
    - name: Generate customized landing page
      ansible.builtin.copy:
        content: "{{ ansible_facts['fqdn'] }} ({{ ansible_facts['default_ipv4']['address'] }}) has been customized by Ansible.\n"
        dest: "{{ web_root }}/index.html"
```

---

## 3. Protecting Secrets with Ansible Vault

Storing plain-text passwords in Git or playbooks creates serious security vulnerabilities. Ansible Vault encrypts variables, files, or sensitive payloads using AES-256 encryption.

### Creating an Encrypted Variable File
```bash
ansible-vault create vars/secret.yml
```
You are prompted for a vault password. Inside the file, define your sensitive variables:
```yaml
web_pass: redhat
```

### Loading Vault Files in a Playbook
Include the encrypted file using `vars_files`:
```yaml
- name: Verify Web Authentication
  hosts: localhost
  become: false
  vars:
    web_user: guest
  vars_files:
    - vars/secret.yml
```

### Running with Vault Credentials
When executing your playbook, pass `--ask-vault-pass` or point to a vault password file:
```bash
ansible-playbook --ask-vault-pass playbook.yml
```

---

## 4. Multi-Play Playbooks

Ansible playbooks can contain multiple plays. A common architecture pattern is:
1. **Play 1**: Target the remote managed hosts (`webserver`) with privilege escalation (`become: true`) to install packages, configure firewalld, deploy web content, and start services.
2. **Play 2**: Target the local control node (`workstation` / `localhost`) without privilege escalation (`become: false`) to test external connectivity, ping API endpoints, or verify HTTP authentication using the `ansible.builtin.uri` module.
