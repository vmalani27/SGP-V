# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.synced_folder "./orchestrator", "/opt/sgp/orchestrator"
  config.vm.synced_folder "./next-app", "/opt/sgp/next-app"
  config.vm.synced_folder "./cli", "/opt/sgp/cli"
  config.vm.synced_folder "./environments", "/opt/sgp/environments"

  # Step 1: Base Image (Ubuntu Server 22.04 LTS for VMware)
  config.vm.box = "generic/ubuntu2204"

  # Step 3: Network & Port Forwarding
  config.vm.network "forwarded_port", guest: 22, host: 2222, id: "ssh", auto_correct: true
  config.vm.network "forwarded_port", guest: 8000, host: 8001, id: "orchestrator", auto_correct: true
  config.vm.network "forwarded_port", guest: 3000, host: 3000, id: "frontend", auto_correct: true
  config.vm.network "forwarded_port", guest: 8080, host: 8080, auto_correct: true
  config.vm.network "forwarded_port", guest: 443, host: 8443, auto_correct: true

  # Step 2 & 4: VM Hardware Resource Allocation & VMware Settings
  config.vm.provider "vmware_desktop" do |v|
    v.linked_clone = false
    v.vmx["numvcpus"] = "4"
    v.vmx["memsize"] = "3072"

    # Nested virtualization for Sysbox
    v.vmx["vhv.enable"] = "TRUE"
    v.vmx["vpmc.enable"] = "TRUE"

    v.gui = false
  end

  config.vm.provider "virtualbox" do |vb|
    vb.cpus = 4
    vb.memory = 3072
    # Ensure nested virtualization is enabled for sysbox
    vb.customize ["modifyvm", :id, "--nested-hw-virt", "on"]
  end

  # Provisioning: Docker CE → Sysbox CE → Orchestrator → Lab Images
  config.vm.provision "shell", path: "provisioning/install-docker.sh"
  config.vm.provision "shell", path: "provisioning/install-sysbox.sh"
  config.vm.provision "shell", path: "provisioning/install-orchestrator.sh"
  config.vm.provision "shell", path: "provisioning/build-lab-images.sh"
  config.vm.provision "shell", path: "provisioning/install-frontend.sh"
end
