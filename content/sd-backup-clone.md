# Jetson Master SD Backup and Image-to-SD Clone Runbook

## Purpose

This guide explains how to:

1. Create a **bit-for-bit backup image** of a known-good Jetson master SD card.
2. Compress the image safely with `zstd`.
3. Verify the backup with a SHA-256 checksum.
4. Restore the image onto another SD card.
5. Avoid common mistakes such as imaging the wrong disk or restoring to a card that is slightly too small.

This method is intended for:

```text
MASTER SD
   |
   +--> compressed image backup
   |
   +--> future SD clones
```

For **SD -> NVMe**, use the separate NVIDIA-NVMe + `rsync` procedure instead.

---

# 1. Recommended Backup Strategy

Keep three independent copies of the master system:

```text
1. Physical MASTER SD
2. Compressed image file
3. Second copy of the compressed image on another disk/NAS
```

Example:

```text
MASTER SD
   |
   +--> jetson-master-r36.5.img.zst
           |
           +--> external SSD
           +--> backup HDD / NAS
```

Also keep the checksum file:

```text
jetson-master-r36.5.img.zst.sha256
```

---

# 2. Important Safety Rule

Do **not** create the image while the Jetson is actively booted from that SD card.

Recommended procedure:

```text
1. Shut down Jetson
2. Remove master SD
3. Insert SD into Ubuntu laptop/card reader
4. Image the SD from the laptop
```

This avoids copying a filesystem while it is changing.

---

# 3. Insert the Master SD Into the Ubuntu Laptop

Insert the SD card into the laptop or USB card reader.

Then identify it:

```bash
lsblk -o NAME,SIZE,MODEL,TRAN,FSTYPE,MOUNTPOINTS
```

Example:

```text
NAME   SIZE   MODEL              TRAN FSTYPE MOUNTPOINTS
nvme0n1 1.8T  Laptop SSD         nvme
sdb    119.1G Generic SD Reader  usb
└─sdb1 119.1G                         ext4   /media/user/...
```

In this example:

```text
WHOLE SD DEVICE = /dev/sdb
```

The partition:

```text
/dev/sdb1
```

is **not** what we want for a full-disk image.

We want the whole device:

```text
/dev/sdb
```

---

# 4. Double-Check the SD Device

Before using `dd`, verify carefully:

```bash
lsblk -b -o NAME,SIZE,MODEL,TRAN
```

Example:

```text
sdb 127865454592 Generic SD Reader usb
```

Record the exact size.

You can also inspect:

```bash
sudo fdisk -l /dev/sdb
```

> **STOP if you are not 100% sure which device is the SD card.**
>
> Using the wrong `/dev/...` device with `dd` can destroy another disk.

---

# 5. Unmount the SD Card

Ubuntu may automatically mount the SD partition.

Unmount all SD partitions:

```bash
sudo umount /dev/sdb?* 2>/dev/null
```

Check:

```bash
lsblk -o NAME,SIZE,MOUNTPOINTS /dev/sdb
```

Expected:

```text
sdb
└─sdb1
```

with **no mount point** shown.

---

# 6. Install zstd

Install `zstd` once:

```bash
sudo apt update
sudo apt install zstd
```

Check:

```bash
zstd --version
```

---

# 7. Create a Backup Directory

Example:

```bash
mkdir -p ~/jetson-master-images
cd ~/jetson-master-images
```

Recommended filename:

```text
jetson-master-r36.5-YYYY-MM-DD.img.zst
```

Example:

```text
jetson-master-r36.5-2026-08-08.img.zst
```

Using dates helps track revisions.

---

# 8. Create the Compressed Master Image

Assuming the SD is:

```text
/dev/sdb
```

run:

```bash
sudo dd if=/dev/sdb bs=16M status=progress \
  | zstd -T0 -6 -o jetson-master-r36.5.img.zst
```

Explanation:

```text
dd
    reads the entire SD card

if=/dev/sdb
    input = complete SD device

bs=16M
    reads in 16 MB blocks

status=progress
    shows progress

zstd
    compresses the raw image

-T0
    use all CPU threads

-6
    moderate compression level
```

The image includes:

```text
- partition table
- boot sectors
- filesystem metadata
- Ubuntu root filesystem
- user accounts
- ROS installation
- packages
- home directories
- services
- application files
- configuration
```

---

# 9. Wait for Completion

When the command finishes, verify the file exists:

```bash
ls -lh jetson-master-r36.5.img.zst
```

Example:

```text
-rw-r--r-- 1 user user 23G Aug  8 18:00 jetson-master-r36.5.img.zst
```

The compressed file can be much smaller than the nominal SD size if the SD contains lots of unused space.

---

# 10. Test the zstd Archive

Before trusting the backup:

```bash
zstd -t jetson-master-r36.5.img.zst
```

A successful test should end without an error.

Typical success output is similar to:

```text
No error detected
```

---

# 11. Create a SHA-256 Checksum

Create a checksum:

```bash
sha256sum jetson-master-r36.5.img.zst \
  > jetson-master-r36.5.img.zst.sha256
```

View it:

```bash
cat jetson-master-r36.5.img.zst.sha256
```

Example:

```text
abcd1234...  jetson-master-r36.5.img.zst
```

---

# 12. Verify the Image Later

Whenever you copy the image to another disk, verify it:

```bash
sha256sum -c jetson-master-r36.5.img.zst.sha256
```

Expected:

```text
jetson-master-r36.5.img.zst: OK
```

If it does **not** say `OK`, do not use the image for cloning.

---

# 13. Keep a Second Backup Copy

Copy both files to another physical disk:

```bash
cp jetson-master-r36.5.img.zst \
   /path/to/backup-drive/
```

and:

```bash
cp jetson-master-r36.5.img.zst.sha256 \
   /path/to/backup-drive/
```

Recommended:

```text
Primary copy:
    external SSD

Secondary copy:
    HDD / NAS / another machine
```

Do not keep the only backup on the same laptop SSD.

---

# 14. Restore the Image to a New SD Card

Insert a new SD card into the laptop.

Identify it again:

```bash
lsblk -o NAME,SIZE,MODEL,TRAN,MOUNTPOINTS
```

Suppose the new SD is:

```text
/dev/sdb
```

Unmount it:

```bash
sudo umount /dev/sdb?* 2>/dev/null
```

Verify:

```bash
lsblk -o NAME,SIZE,MOUNTPOINTS /dev/sdb
```

---

# 15. Check Destination SD Capacity

This is important.

Check the exact size of the original master SD:

```bash
lsblk -b -o NAME,SIZE,MODEL
```

Then check the destination card.

Example:

```text
Original master:
127865454592 bytes

Destination:
128043712512 bytes
```

This is safe because:

```text
destination >= original
```

But two cards both labeled:

```text
128 GB
```

may have slightly different real capacities.

A raw full-disk image will fail if the destination is even slightly smaller.

---

# 16. Restore the Compressed Image

Verify the backup first:

```bash
sha256sum -c jetson-master-r36.5.img.zst.sha256
```

Then restore:

```bash
zstd -dc jetson-master-r36.5.img.zst \
  | sudo dd of=/dev/sdb bs=16M status=progress conv=fsync
```

Explanation:

```text
zstd -dc
    decompress image to stdout

dd of=/dev/sdb
    write directly to entire SD device

conv=fsync
    flush data before dd exits
```

---

# 17. Flush Writes

After restoration:

```bash
sync
```

Wait until the command returns.

Then remove and reinsert the SD card.

---

# 18. Verify the Restored SD

Run:

```bash
lsblk -o NAME,SIZE,FSTYPE,LABEL,PARTLABEL,MOUNTPOINTS /dev/sdb
```

You should see the same partition layout as the master.

Optional filesystem check:

```bash
sudo fsck -f /dev/sdb1
```

Only run `fsck` while the partition is unmounted.

---

# 19. Boot-Test the New SD

Insert the cloned SD into the Jetson.

Boot normally.

Then verify:

```bash
findmnt /
```

Check release:

```bash
head -n 1 /etc/nv_tegra_release
```

Check important services:

```bash
systemctl --failed
```

Check ROS:

```bash
ls /opt/ros
```

Check your project directory:

```bash
ls ~/works
```

---

# 20. Important: Cloned Machine Identity

A raw SD image duplicates everything, including:

```text
/etc/machine-id
SSH host keys
hostname
network configuration
```

If only one clone is ever running at a time, this may not matter much.

If multiple cloned Jetsons will run simultaneously on the same network, regenerate the machine identity.

---

# 21. Regenerate machine-id

On the cloned Jetson:

```bash
sudo rm -f /etc/machine-id
```

Then:

```bash
sudo systemd-machine-id-setup
```

Verify:

```bash
cat /etc/machine-id
```

---

# 22. Regenerate SSH Host Keys

Remove old copied host keys:

```bash
sudo rm -f /etc/ssh/ssh_host_*
```

Generate new ones:

```bash
sudo ssh-keygen -A
```

Restart SSH:

```bash
sudo systemctl restart ssh
```

---

# 23. Change Hostname for Each Clone

Example:

```bash
sudo hostnamectl set-hostname jetson-01
```

Check:

```bash
hostnamectl
```

Also inspect:

```bash
cat /etc/hosts
```

If the old hostname is present, update the appropriate line:

```bash
sudo nano /etc/hosts
```

---

# 24. Recommended Naming Scheme

For image files:

```text
jetson-master-r36.5-2026-08-08.img.zst
jetson-master-r36.5-2026-08-08.img.zst.sha256
```

For later revisions:

```text
jetson-master-r36.5-2026-08-15.img.zst
jetson-master-r36.5-2026-08-15.img.zst.sha256
```

Do not overwrite an older known-good image immediately.

Keep at least:

```text
MASTER-v1
MASTER-v2
```

until the new revision has been tested.

---

# 25. Production Tip: Make the Master Image Smaller Than the Physical SD

If you plan to clone many SD cards, a full 128 GB raw image can cause a problem:

```text
128 GB card A
!=
128 GB card B
```

Their exact byte capacities can differ.

A better production strategy is:

```text
Physical master SD: 128 GB

Actual root partition:
~100-110 GB

Unused space:
remainder
```

Then the image can be reduced so it fits practically any normal 128 GB destination card.

This requires carefully shrinking the ext4 filesystem and partition before producing the final production image.

Do not resize the production master casually without a backup.

---

# 26. Optional Faster Imaging Method

Instead of storing a plain raw `.img`, compression is recommended:

```text
raw image:
jetson-master.img
    ~full SD size

compressed image:
jetson-master.img.zst
    usually much smaller
```

The recommended command remains:

```bash
sudo dd if=/dev/sdb bs=16M status=progress \
  | zstd -T0 -6 -o jetson-master.img.zst
```

---

# 27. Do Not Use the SD Image Directly for NVMe

The SD image is excellent for:

```text
SD -> image
image -> SD
```

But do not normally do:

```text
SD raw image -> NVMe with dd
```

For NVMe use:

```text
NVIDIA NVMe flash
        |
        v
proper Jetson NVMe partition layout
        |
        v
rsync master SD rootfs -> NVMe APP
```

This preserves the correct Jetson NVMe boot structure.

---

# 28. Recommended Master-Image Workflow

```text
               MASTER SD
                   |
        +----------+----------+
        |                     |
        v                     v
 compressed image         SD -> NVMe
        |                     |
        v                     v
 future SD clones      NVIDIA NVMe layout
                              |
                              v
                         rsync rootfs
```

So:

```text
Image-to-SD:
    use dd + zstd

SD-to-NVMe:
    use NVIDIA flash + rsync
```

---

# 29. Minimal Backup Checklist

```text
[ ] Jetson powered off
[ ] Master SD removed
[ ] SD inserted into Ubuntu laptop
[ ] lsblk identifies exact SD device
[ ] SD partitions unmounted
[ ] zstd installed
[ ] dd + zstd image created
[ ] zstd archive tested
[ ] SHA-256 checksum created
[ ] checksum verified
[ ] second physical backup copy made
```

---

# 30. Minimal Restore Checklist

```text
[ ] New SD inserted
[ ] Exact destination device verified
[ ] Destination partitions unmounted
[ ] Destination capacity >= master SD capacity
[ ] Backup SHA-256 verified
[ ] zstd -> dd restore completed
[ ] sync completed
[ ] SD reinserted
[ ] partition layout checked
[ ] Jetson boot-tested
[ ] machine-id regenerated if needed
[ ] SSH host keys regenerated if needed
[ ] hostname changed if needed
```

---

# 31. Example Complete Backup Session

Assuming the master SD is `/dev/sdb`:

```bash
lsblk -o NAME,SIZE,MODEL,TRAN,FSTYPE,MOUNTPOINTS

sudo umount /dev/sdb?* 2>/dev/null

mkdir -p ~/jetson-master-images
cd ~/jetson-master-images

sudo dd if=/dev/sdb bs=16M status=progress \
  | zstd -T0 -6 -o jetson-master-r36.5.img.zst

zstd -t jetson-master-r36.5.img.zst

sha256sum jetson-master-r36.5.img.zst \
  > jetson-master-r36.5.img.zst.sha256

sha256sum -c jetson-master-r36.5.img.zst.sha256
```

---

# 32. Example Complete Restore Session

Assuming the destination SD is `/dev/sdb`:

```bash
lsblk -o NAME,SIZE,MODEL,TRAN,MOUNTPOINTS

sudo umount /dev/sdb?* 2>/dev/null

sha256sum -c jetson-master-r36.5.img.zst.sha256

zstd -dc jetson-master-r36.5.img.zst \
  | sudo dd of=/dev/sdb bs=16M status=progress conv=fsync

sync
```

Then remove/reinsert the SD and boot-test it in the Jetson.

---

# Final Recommendation

Keep the physical master SD as the **working master**, but treat the verified compressed image as the **disaster-recovery master**.

Recommended storage:

```text
Physical master SD
        +
verified .img.zst
        +
SHA-256 checksum
        +
second backup copy
```

This gives a reliable recovery path even if the physical master SD is lost or damaged.
