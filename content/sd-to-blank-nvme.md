# Clone a Master SD Card to an Empty NVMe SSD

## Purpose

This runbook prepares a **brand-new NVMe SSD** as a proper Jetson NVMe boot disk, then copies the complete Linux root filesystem from a known-good **master SD card** into the NVMe `APP` partition.

The customer's original NVMe is **never installed, mounted, read, or written**.

### Intended platform

- Jetson Orin Nano Developer Kit / compatible Orin Nano module
- JetPack 6.2.2
- Jetson Linux / L4T R36.5.0
- Super configuration: `jetson-orin-nano-devkit-super`
- One brand-new NVMe SSD
- One known-good master SD card
- Ubuntu x86-64 laptop/PC with matching R36.5 `Linux_for_Tegra`

> **Important:** The flash command in this guide uses `--external-only`. It writes the new NVMe but deliberately does **not** request a QSPI reflash. This assumes the Jetson's existing QSPI/UEFI is already compatible with R36.5 and can boot the master SD. If that is not true, see the QSPI note near the end.

---

# Overview

```text
Customer's original NVMe
        |
        +--> NOT PRESENT AT ANY TIME


Stage A
=======

Ubuntu laptop
    |
    | USB-C, Force Recovery
    v
Customer Jetson
    |
    +--> brand-new NVMe
             |
             +--> NVIDIA initrd flash
                  creates Jetson NVMe partitions
                  including APP


Stage B
=======

Customer Jetson
    |
    +--> master SD       -> running root filesystem /
    |
    +--> prepared NVMe   -> /dev/nvme0n1p1 = APP
                                ^
                                |
                           rsync from /


Stage C
=======

Remove master SD
        |
        v
Boot from new NVMe
```

---

# 0. Safety Rules

Before doing anything destructive:

1. **Customer's original NVMe must not be installed.**
2. During the NVIDIA flash stage, the only NVMe installed must be the **brand-new replacement NVMe**.
3. During the cloning stage, verify that `/` is running from the **master SD**, not from NVMe.
4. Verify that `/dev/nvme0n1p1` is the NVMe `APP` partition before mounting or copying.
5. Do **not** use `dd` for the SD-to-NVMe clone.
6. Never guess a device name. Always confirm with `findmnt`, `lsblk`, and `blkid`.

---

# 1. One-Time Laptop Preparation

If a correct R36.5 `Linux_for_Tegra` tree is already prepared on the laptop, skip to Section 2.

## 1.1 Download the Two NVIDIA R36.5.0 Archives First

Before connecting the Jetson for flashing, download these **two files to the Ubuntu laptop**:

```text
Jetson_Linux_R36.5.0_aarch64.tbz2
Tegra_Linux_Sample-Root-Filesystem_R36.5.0_aarch64.tbz2
```

Official NVIDIA Jetson Linux R36.5 download page:

```text
https://developer.nvidia.com/embedded/jetson-linux-r365
```

On that page, download:

```text
Driver Package (BSP)
    -> Jetson_Linux_R36.5.0_aarch64.tbz2

Sample Root Filesystem
    -> Tegra_Linux_Sample-Root-Filesystem_R36.5.0_aarch64.tbz2
```

These two archives have different jobs:

```text
Jetson_Linux_R36.5.0_aarch64.tbz2
    |
    +--> NVIDIA Jetson Linux BSP
    +--> bootloader files
    +--> kernel
    +--> board configuration files
    +--> l4t_initrd_flash.sh
    +--> NVMe partition-layout XML files


Tegra_Linux_Sample-Root-Filesystem_R36.5.0_aarch64.tbz2
    |
    +--> Ubuntu root filesystem used by the NVIDIA flashing environment
```

These files are needed **only on the Ubuntu laptop**.

They do **not** need to be copied to:

```text
- the master SD card
- the blank NVMe
- the customer's original NVMe
```

Assuming the browser downloads both files into:

```text
~/Downloads/
```

verify them:

```bash
ls -lh ~/Downloads/Jetson_Linux_R36.5.0_aarch64.tbz2
ls -lh ~/Downloads/Tegra_Linux_Sample-Root-Filesystem_R36.5.0_aarch64.tbz2
```

Both commands should show an existing file with a non-zero size.

## 1.2 Create the NVIDIA Flashing Environment

Create a working directory:

```bash
mkdir -p ~/nvidia/r36.5
cd ~/nvidia/r36.5
```

Extract the NVIDIA Jetson Linux BSP:

```bash
tar xf ~/Downloads/Jetson_Linux_R36.5.0_aarch64.tbz2
```

This should create:

```text
~/nvidia/r36.5/Linux_for_Tegra/
```

Verify:

```bash
ls ~/nvidia/r36.5/Linux_for_Tegra
```

Now unpack the NVIDIA Sample Root Filesystem **inside** `Linux_for_Tegra/rootfs`:

```bash
sudo tar xpf     ~/Downloads/Tegra_Linux_Sample-Root-Filesystem_R36.5.0_aarch64.tbz2     -C ~/nvidia/r36.5/Linux_for_Tegra/rootfs
```

Enter the BSP directory:

```bash
cd ~/nvidia/r36.5/Linux_for_Tegra
```

Install NVIDIA flash prerequisites:

```bash
sudo ./tools/l4t_flash_prerequisites.sh
```

Apply NVIDIA binaries to the sample root filesystem:

```bash
sudo ./apply_binaries.sh
```

After this step the laptop should have a flashing tree similar to:

```text
~/nvidia/r36.5/Linux_for_Tegra/
├── bootloader/
├── kernel/
├── rootfs/
├── tools/
│   └── kernel_flash/
│       ├── l4t_initrd_flash.sh
│       └── flash_l4t_t234_nvme.xml
├── apply_binaries.sh
└── jetson-orin-nano-devkit-super.conf
```

Verify the important files:

```bash
test -f jetson-orin-nano-devkit-super.conf     && echo "Super config: OK"

test -f tools/kernel_flash/l4t_initrd_flash.sh     && echo "initrd flash script: OK"

test -f tools/kernel_flash/flash_l4t_t234_nvme.xml     && echo "NVMe layout: OK"
```

Check the prepared Jetson Linux release:

```bash
head -n 1 rootfs/etc/nv_tegra_release
```

Expected to contain something similar to:

```text
# R36 (release), REVISION: 5.0
```

> **Important:** Complete this laptop preparation before starting Force Recovery / `lsusb` steps.

```bash
mkdir -p ~/nvidia/r36.5
cd ~/nvidia/r36.5
```

Extract the Jetson Linux BSP:

```bash
tar xf ~/Downloads/Jetson_Linux_R36.5.0_aarch64.tbz2
```

Populate the rootfs:

```bash
sudo tar xpf \
    ~/Downloads/Tegra_Linux_Sample-Root-Filesystem_R36.5.0_aarch64.tbz2 \
    -C Linux_for_Tegra/rootfs
```

Enter the BSP directory:

```bash
cd ~/nvidia/r36.5/Linux_for_Tegra
```

Install NVIDIA flash prerequisites:

```bash
sudo ./tools/l4t_flash_prerequisites.sh
```

Apply NVIDIA binaries to the sample rootfs:

```bash
sudo ./apply_binaries.sh
```

Check that the files we need exist:

```bash
test -f jetson-orin-nano-devkit-super.conf && echo "Super config: OK"
test -f tools/kernel_flash/flash_l4t_t234_nvme.xml && echo "NVMe layout: OK"
```

Check the release inside the prepared rootfs:

```bash
head -n 1 rootfs/etc/nv_tegra_release
```

Expected to contain something similar to:

```text
# R36 (release), REVISION: 5.0
```

---

# 2. Install the Brand-New NVMe

Power the Jetson completely off.

Do **not** insert the master SD yet.

Install only:

```text
Jetson
  +
brand-new replacement NVMe
```

The customer's original NVMe must remain physically separate.

---

# 3. Enter Force Recovery Mode

For the Jetson Orin Nano Developer Kit:

1. Disconnect Jetson power.
2. Connect the Jetson USB-C device/recovery port to the Ubuntu laptop using a good USB data cable.
3. Short **REC** to **GND** on the 12-pin button header.
4. Reconnect Jetson power.
5. The board should enter Force Recovery Mode.
6. After recovery mode is latched, the recovery jumper can be removed.

On the **Ubuntu laptop**, run:

```bash
lsusb
```

A more focused check is:

```bash
lsusb | grep -i 0955
```

For an Orin Nano you should see an NVIDIA USB device similar to:

```text
ID 0955:7523 NVIDIA Corp.
```

`7523` is used by Orin Nano 8 GB modules. A 4 GB module may appear as `0955:7623`.

If nothing containing `0955` appears:

```bash
watch -n 1 'lsusb | grep -i 0955'
```

Then re-check the recovery jumper, USB-C cable, port, and power sequence.

Press `Ctrl+C` to exit `watch`.

> **STOP:** Do not run the flash command until `lsusb` shows the NVIDIA recovery device.

---

# 4. Prepare the Blank NVMe with NVIDIA's Jetson Layout

All commands in this section are run on the **Ubuntu laptop**.

Go to the R36.5 BSP directory:

```bash
cd ~/nvidia/r36.5/Linux_for_Tegra
```

Optional final checks:

```bash
pwd
ls jetson-orin-nano-devkit-super.conf
ls tools/kernel_flash/flash_l4t_t234_nvme.xml
lsusb | grep -i 0955
```

## Flash only the external NVMe

Run:

```bash
sudo ./tools/kernel_flash/l4t_initrd_flash.sh \
    --external-only \
    --network usb0 \
    --external-device nvme0n1 \
    -c ./tools/kernel_flash/flash_l4t_t234_nvme.xml \
    --erase-all \
    --showlogs \
    jetson-orin-nano-devkit-super \
    external
```

What this stage is intended to do:

```text
blank NVMe
    |
    +--> GPT
    +--> APP
    +--> Jetson boot/support partitions
    +--> NVIDIA-generated rootfs/boot configuration
```

Because `--external-only` is used, this runbook does not intentionally request a QSPI flash.

Let the script finish completely.

A successful run should finish without a flash error.

---

# 5. Power Off After the NVMe Flash

After the NVIDIA flash command succeeds, power off the Jetson completely.

If needed, disconnect power.

The USB-C cable may remain connected, but the Jetson must no longer be in Force Recovery Mode for normal boot.

Make sure the REC/GND recovery jumper has been removed.

---

# 6. Insert the Master SD Card

With power off:

```text
Jetson
  |
  +--> newly prepared NVMe
  |
  +--> MASTER SD
```

Power the Jetson normally.

The goal is to boot **from the master SD**.

If a UEFI boot menu appears or the wrong device is selected, explicitly choose the SD card.

---

# 7. Verify That the Jetson Is Running From the Master SD

This is the most important verification before the copy.

On the Jetson terminal, run:

```bash
findmnt /
```

Then:

```bash
findmnt -n -o SOURCE /
```

Also run:

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,LABEL,PARTLABEL,UUID,PARTUUID,MOUNTPOINTS
```

Typical desired situation:

```text
mmcblk...p1   ...   /
nvme0n1
├─nvme0n1p1         APP
├─nvme0n1p2
├─...
```

The exact SD device may be `mmcblk0p1`, `mmcblk1p1`, or another `mmcblk...` device.

## Automatic sanity check

Run:

```bash
ROOT_SOURCE="$(findmnt -n -o SOURCE /)"
echo "Current root filesystem: $ROOT_SOURCE"
```

Then:

```bash
case "$ROOT_SOURCE" in
    /dev/mmcblk*p*)
        echo "OK: root filesystem appears to be on SD/eMMC-style media"
        ;;
    *)
        echo "STOP: root filesystem is NOT clearly on the master SD"
        ;;
esac
```

> **STOP IMMEDIATELY if `findmnt /` shows `/dev/nvme0n1p1`.**
>
> We must clone **SD -> NVMe**, never NVMe -> itself.

---

# 8. Verify the NVMe APP Partition

Run:

```bash
lsblk -o NAME,SIZE,FSTYPE,LABEL,PARTLABEL,UUID,PARTUUID /dev/nvme0n1
```

The NVIDIA-created `APP` partition should normally be:

```text
/dev/nvme0n1p1
```

Check it directly:

```bash
sudo blkid /dev/nvme0n1p1
```

Also inspect its partition label:

```bash
lsblk -no PATH,PARTLABEL /dev/nvme0n1
```

You want to see something corresponding to:

```text
/dev/nvme0n1p1 APP
```

> **STOP if `nvme0n1p1` is not clearly the APP partition.**

---

# 9. Mount the NVMe APP Partition

Create a mount point:

```bash
sudo mkdir -p /mnt/nvme-app
```

Mount APP:

```bash
sudo mount /dev/nvme0n1p1 /mnt/nvme-app
```

Verify:

```bash
findmnt /mnt/nvme-app
```

Check both source and destination capacity:

```bash
df -h /
df -h /mnt/nvme-app
```

The NVMe must have enough free space to hold the master SD root filesystem.

---

# 10. Record the NVMe APP PARTUUID

Run:

```bash
NVME_PARTUUID="$(sudo blkid -s PARTUUID -o value /dev/nvme0n1p1)"
echo "NVMe APP PARTUUID = $NVME_PARTUUID"
```

Save it:

```bash
echo "$NVME_PARTUUID" | sudo tee /root/nvme-app-partuuid.txt
```

This value identifies the new NVMe APP partition to the Jetson boot configuration.

---

# 11. Preserve the NVMe-Specific Boot Files

The NVIDIA flash created configuration that points to this particular NVMe.

Preserve it before copying the master SD filesystem.

Create a backup directory:

```bash
sudo mkdir -p /root/nvme-preserve
```

Back up `extlinux.conf`:

```bash
sudo cp -a \
    /mnt/nvme-app/boot/extlinux/extlinux.conf \
    /root/nvme-preserve/extlinux.conf
```

Back up `fstab`:

```bash
sudo cp -a \
    /mnt/nvme-app/etc/fstab \
    /root/nvme-preserve/fstab
```

Back up `nv_boot_control.conf` if present:

```bash
if [ -f /mnt/nvme-app/etc/nv_boot_control.conf ]; then
    sudo cp -a \
        /mnt/nvme-app/etc/nv_boot_control.conf \
        /root/nvme-preserve/nv_boot_control.conf
fi
```

Save the current NVMe identity information:

```bash
sudo blkid /dev/nvme0n1p1 | \
    sudo tee /root/nvme-preserve/nvme-app-blkid.txt
```

Inspect the NVIDIA-generated boot configuration:

```bash
grep -nE 'root=|APPEND' \
    /mnt/nvme-app/boot/extlinux/extlinux.conf
```

---

# 12. rsync Master SD -> NVMe APP

This is the actual clone.

Run:

```bash
sudo rsync -aAXHx \
    --numeric-ids \
    --delete \
    --info=progress2 \
    --exclude='/dev/*' \
    --exclude='/proc/*' \
    --exclude='/sys/*' \
    --exclude='/run/*' \
    --exclude='/tmp/*' \
    --exclude='/mnt/*' \
    --exclude='/media/*' \
    --exclude='/lost+found' \
    --exclude='/boot/extlinux/extlinux.conf' \
    --exclude='/etc/fstab' \
    --exclude='/etc/nv_boot_control.conf' \
    / \
    /mnt/nvme-app/
```

Meaning of important options:

```text
-a  archive mode: permissions, ownership, timestamps, links, etc.
-A  preserve ACLs
-X  preserve extended attributes
-H  preserve hard links
-x  stay on the source root filesystem only
--numeric-ids
    preserve UID/GID numbers exactly
--delete
    remove destination files that are not in the master rootfs
```

The three NVMe-specific files are deliberately excluded:

```text
/boot/extlinux/extlinux.conf
/etc/fstab
/etc/nv_boot_control.conf
```

Therefore the master SD cannot overwrite the new NVMe's identity/boot configuration for those files.

---

# 13. Optional Second rsync Pass

A second pass is useful because the source system is live and a few files may have changed during the first copy.

Run the same command again:

```bash
sudo rsync -aAXHx \
    --numeric-ids \
    --delete \
    --info=progress2 \
    --exclude='/dev/*' \
    --exclude='/proc/*' \
    --exclude='/sys/*' \
    --exclude='/run/*' \
    --exclude='/tmp/*' \
    --exclude='/mnt/*' \
    --exclude='/media/*' \
    --exclude='/lost+found' \
    --exclude='/boot/extlinux/extlinux.conf' \
    --exclude='/etc/fstab' \
    --exclude='/etc/nv_boot_control.conf' \
    / \
    /mnt/nvme-app/
```

The second pass should normally be much faster.

---

# 14. Verify That the NVMe Boot Configuration Still Points to the NVMe

Re-read the NVMe APP PARTUUID:

```bash
NVME_PARTUUID="$(sudo blkid -s PARTUUID -o value /dev/nvme0n1p1)"
echo "$NVME_PARTUUID"
```

Inspect the preserved/generated `extlinux.conf`:

```bash
grep -nE 'root=|APPEND' \
    /mnt/nvme-app/boot/extlinux/extlinux.conf
```

If the file explicitly contains:

```text
root=PARTUUID=...
```

the value should correspond to the new NVMe APP PARTUUID.

For comparison:

```bash
echo "Expected NVMe PARTUUID: $NVME_PARTUUID"
```

Also inspect the destination `fstab`:

```bash
cat /mnt/nvme-app/etc/fstab
```

## Only if `extlinux.conf` contains a wrong `root=PARTUUID=...`

Do **not** run this blindly.

First inspect the file:

```bash
grep -n 'root=PARTUUID=' \
    /mnt/nvme-app/boot/extlinux/extlinux.conf
```

If there is an explicit `root=PARTUUID=OLD_VALUE` and it is wrong, replace only that value:

```bash
sudo sed -i -E \
    "s#root=PARTUUID=[^ ]+#root=PARTUUID=${NVME_PARTUUID}#g" \
    /mnt/nvme-app/boot/extlinux/extlinux.conf
```

Then verify again:

```bash
grep -n 'root=PARTUUID=' \
    /mnt/nvme-app/boot/extlinux/extlinux.conf
```

If there is **no explicit `root=PARTUUID=` entry**, do not invent one. The NVIDIA-generated configuration may provide the root device through another bootloader mechanism.

---

# 15. Recommended: Give the Clone a Unique Machine Identity

If this master image will be copied to multiple Jetsons, do not leave every clone with exactly the same system machine ID and SSH host keys.

## Generate a new machine ID for this NVMe clone

```bash
sudo rm -f /mnt/nvme-app/etc/machine-id
```

Then:

```bash
sudo systemd-machine-id-setup --root=/mnt/nvme-app
```

Check:

```bash
cat /mnt/nvme-app/etc/machine-id
```

## Generate new SSH host keys

Remove copied host keys:

```bash
sudo rm -f /mnt/nvme-app/etc/ssh/ssh_host_*
```

Generate new keys for the cloned rootfs:

```bash
sudo ssh-keygen -A -f /mnt/nvme-app
```

This keeps the user's accounts and files but prevents multiple cloned Jetsons from sharing the same SSH host identity.

---

# 16. Optional: Change the Clone Hostname

If every customer unit needs a unique hostname, change it before first boot.

Example:

```bash
NEW_HOSTNAME="jetson-01"
```

Set it:

```bash
echo "$NEW_HOSTNAME" | \
    sudo tee /mnt/nvme-app/etc/hostname
```

Then inspect:

```bash
cat /mnt/nvme-app/etc/hosts
```

If the old hostname appears in `/etc/hosts`, edit it:

```bash
sudo nano /mnt/nvme-app/etc/hosts
```

Replace only the hostname entry as appropriate.

---

# 17. Final Filesystem Checks

Check destination usage:

```bash
df -h /mnt/nvme-app
```

Check the master and clone root directories:

```bash
sudo ls -la /
sudo ls -la /mnt/nvme-app
```

Verify important master content exists on the clone, for example:

```bash
ls /mnt/nvme-app/home
```

If ROS is installed in the master image, you can also inspect:

```bash
ls /mnt/nvme-app/opt/ros 2>/dev/null || true
```

Flush all pending writes:

```bash
sync
```

---

# 18. Unmount and Power Off

Unmount the NVMe APP partition:

```bash
sudo umount /mnt/nvme-app
```

Verify it is no longer mounted:

```bash
findmnt /mnt/nvme-app
```

No output is expected.

Flush again:

```bash
sync
```

Power off:

```bash
sudo poweroff
```

Wait until the Jetson is completely off.

---

# 19. Remove the Master SD

With power fully off:

1. Remove the master SD card.
2. Leave the newly cloned NVMe installed.
3. Make sure no Force Recovery jumper is installed.

Now the Jetson contains:

```text
Jetson
  |
  +--> cloned NVMe only
```

---

# 20. First Boot Test From NVMe

Power the Jetson normally.

If necessary, use UEFI Boot Manager and select the NVMe.

After Ubuntu starts, open a terminal.

Verify root:

```bash
findmnt /
```

Then:

```bash
findmnt -n -o SOURCE /
```

Expected:

```text
/dev/nvme0n1p1
```

or an equivalent device-mapper/root representation that resolves to the NVMe APP partition.

Inspect all block devices:

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,LABEL,PARTLABEL,UUID,PARTUUID,MOUNTPOINTS
```

Check the kernel boot argument:

```bash
cat /proc/cmdline
```

Extract only the root argument:

```bash
grep -o 'root=[^ ]*' /proc/cmdline
```

If it uses a PARTUUID, compare:

```bash
sudo blkid -s PARTUUID -o value /dev/nvme0n1p1
```

Check the Jetson Linux release:

```bash
head -n 1 /etc/nv_tegra_release
```

Expected to correspond to R36.5.0.

Check for failed services:

```bash
systemctl --failed
```

Check disk space:

```bash
df -h /
```

---

# 21. Functional Checks

Verify the items that make the master SD valuable.

Examples:

```bash
ls -la ~
```

For ROS:

```bash
ls /opt/ros
```

If a particular ROS distribution is installed:

```bash
ros2 --help
```

Check custom work directories, for example:

```bash
ls ~/works
```

Check networking:

```bash
ip addr
```

Check enabled services:

```bash
systemctl --type=service --state=running
```

If the cloned Jetson passes these checks, the SD -> NVMe migration is complete.

---

# 22. Minimal Repeatable Checklist

For subsequent customer Jetsons:

```text
[ ] Customer original NVMe physically absent
[ ] Brand-new NVMe installed
[ ] No master SD installed during Stage A
[ ] Force Recovery entered
[ ] lsusb shows NVIDIA 0955:xxxx
[ ] R36.5 Linux_for_Tegra selected
[ ] external-only NVMe flash succeeds
[ ] Power off
[ ] Master SD inserted
[ ] Normal boot from master SD
[ ] findmnt / confirms SD
[ ] lsblk confirms nvme0n1p1 = APP
[ ] Mount APP at /mnt/nvme-app
[ ] Record NVMe PARTUUID
[ ] Preserve extlinux.conf / fstab / nv_boot_control.conf
[ ] rsync / -> /mnt/nvme-app
[ ] Optional second rsync
[ ] Verify NVMe PARTUUID boot configuration
[ ] Regenerate machine-id
[ ] Regenerate SSH host keys
[ ] sync
[ ] umount
[ ] poweroff
[ ] Remove master SD
[ ] Boot NVMe
[ ] findmnt / confirms NVMe
[ ] Test ROS/custom services/application
```

---

# QSPI / UEFI Note

This runbook deliberately uses:

```text
--external-only
```

so the NVIDIA flash stage targets the replacement NVMe without intentionally reflashing QSPI.

That is appropriate when the Jetson's existing QSPI/UEFI is already compatible with the master SD and R36.5.

If the Jetson cannot boot the R36.5 master SD, or the final NVMe will not boot because the installed QSPI firmware is too old/incompatible, use NVIDIA's standard Orin Nano R36.5 flash procedure that flashes both QSPI and the external NVMe.

For the Super configuration, NVIDIA's R36.5 Quick Start documents the full flash form as:

```bash
sudo ./tools/kernel_flash/l4t_initrd_flash.sh \
    --external-device nvme0n1p1 \
    -c tools/kernel_flash/flash_l4t_t234_nvme.xml \
    -p "-c bootloader/generic/cfg/flash_t234_qspi.xml" \
    --showlogs \
    --network usb0 \
    --erase-all \
    jetson-orin-nano-devkit-super \
    internal
```

Unlike the primary command in this runbook, that command **does modify QSPI firmware**.

Do not switch to it casually on a customer's device.

---

# R36.5 initrd Flash Troubleshooting Note

NVIDIA's R36.5 documentation specifies initrd flash as the official NVMe flashing method for Orin Nano/NX.

There has also been a recent NVIDIA Developer Forum report for JetPack 6.2.2 / L4T R36.5 where an NVMe-only target aborted inside:

```text
tools/kernel_flash/images/l4t_flash_from_kernel.sh
```

with messages similar to:

```text
ls: cannot access '/dev/sd*': No such file or directory
ls: cannot access '/dev/mmcblk*': No such file or directory
```

If your flash fails with **exactly that error**, stop and diagnose that R36.5 initrd-script issue rather than changing partitions manually or using `dd`.

It is not an indication that the new NVMe is necessarily bad.

---

# Official NVIDIA References

NVIDIA Jetson Linux R36.5 Quick Start:

https://docs.nvidia.com/jetson/archives/r36.5/DeveloperGuide/IN/QuickStart.html

NVIDIA Jetson Linux R36.5 Flashing Support:

https://docs.nvidia.com/jetson/archives/r36.5/DeveloperGuide/SD/FlashingSupport.html

Relevant NVIDIA R36.5 documentation points:

- `l4t_initrd_flash.sh` is the official Orin Nano/NX method for NVMe.
- `flash_l4t_t234_nvme.xml` defines the external NVMe partition layout.
- `--external-only` is documented for flashing only an NVMe SSD.
- Using `external` as the root-device mode allows the flash tooling to configure a `root=PARTUUID=...` style external-root boot path.
- R36.5 provides `jetson-orin-nano-devkit-super.conf` for the Super profile.
