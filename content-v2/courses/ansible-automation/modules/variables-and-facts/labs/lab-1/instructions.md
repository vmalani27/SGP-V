# Lab: Managing Variables and Facts

Write and run an Ansible Playbook that uses variables, secrets, and facts.

## Outcomes
- Define and use variables and Ansible facts in a multi-play playbook.
- Store sensitive variables inside an encrypted Ansible Vault file.
- Deploy an Apache HTTP Server with basic authentication, customized dynamic landing page, and firewall rules.
- Automate authentication validation using the `ansible.builtin.uri` module.

---

## 1. Prepare Environment
As the `student` user on the workstation machine, use the `lab` command to prepare your system:

```bash
lab start data-review
cd ~/data-review
```

The files subdirectory contains:
- `files/httpd.conf`: Apache HTTP Server configuration for basic authentication
- `files/.htaccess`: Access control file for document root
- `files/htpasswd`: Credentials for permitted users (`guest`)

---

## 2. Play 1: Deploy Web Server with Basic Authentication
In `~/data-review/playbook.yml`, create the first play targeting the `webserver` host group with privilege escalation (`become: true`).

### Variables
Define the following play variables:

| Variable | Value |
|---|---|
| `firewall_pkg` | `firewalld` |
| `firewall_svc` | `firewalld` |
| `web_pkg` | `httpd` |
| `web_svc` | `httpd` |
| `ssl_pkg` | `mod_ssl` |
| `httpdconf_src` | `files/httpd.conf` |
| `httpdconf_dest` | `/etc/httpd/conf/httpd.conf` |
| `htaccess_src` | `files/.htaccess` |
| `secrets_dir` | `/etc/httpd/secrets` |
| `secrets_src` | `files/htpasswd` |
| `secrets_dest` | `"{{ secrets_dir }}/htpasswd"` |
| `web_root` | `/var/www/html` |

### Tasks
1. **Install Packages**: Ensure the latest version of packages defined by `firewall_pkg`, `web_pkg`, and `ssl_pkg` are installed using `ansible.builtin.dnf` or `ansible.builtin.package`.
2. **Deploy Configuration**: Copy `httpdconf_src` to `httpdconf_dest` using `ansible.builtin.copy`. Ownership: `root:root`, Permissions: `0644`.
3. **Create Secrets Directory**: Use `ansible.builtin.file` to create directory `secrets_dir`. Ownership: `apache:apache`, Permissions: `0500`.
4. **Deploy Credentials**: Copy `secrets_src` to `secrets_dest` using `ansible.builtin.copy`. Ownership: `apache:apache`, Permissions: `0400`.
5. **Deploy .htaccess**: Copy `htaccess_src` to `{{ web_root }}/.htaccess` using `ansible.builtin.copy`. Ownership: `apache:apache`, Permissions: `0400`.
6. **Generate Dynamic Content**: Use `ansible.builtin.copy` to create `{{ web_root }}/index.html` with content:
   ```
   {{ ansible_facts['fqdn'] }} ({{ ansible_facts['default_ipv4']['address'] }}) has been customized by Ansible.
   ```
7. **Enable Firewall**: Use `ansible.builtin.service` to enable and start `{{ firewall_svc }}`.
8. **Open HTTPS Service**: Use `ansible.posix.firewalld` to permit the `https` service permanently and immediately (`permanent: true`, `immediate: true`, `state: enabled`).
9. **Enable Web Service**: Use `ansible.builtin.service` to enable and start `{{ web_svc }}`.

---

## 3. Play 2: Validate Authentication
Add a second play targeting `localhost` without privilege escalation (`become: false`).

- Variable: `web_user: guest`
- Load external variables from `vars/secret.yml` using `vars_files:`.
- **Task 1**: Use `ansible.builtin.uri` to request `https://serverb.lab.example.com` with:
  - `validate_certs: false`
  - `url_username: "{{ web_user }}"`
  - `url_password: "{{ web_pass }}"`
  - `status_code: 200`
  - `return_content: true`
  - `register: auth_test`
- **Task 2**: Print `auth_test.content` using `ansible.builtin.debug`.

---

## 4. Encrypt Secret Variable File
Create `vars/secret.yml` encrypted with Ansible Vault using password `redhat`:

```bash
ansible-vault create vars/secret.yml
```
Add the variable:
```yaml
web_pass: redhat
```

---

## 5. Execute and Grade
Run your playbook:
```bash
ansible-playbook --ask-vault-pass playbook.yml
```

Verify your results:
```bash
lab grade data-review
```
