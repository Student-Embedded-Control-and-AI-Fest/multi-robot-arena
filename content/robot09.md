# Raspbot V2 as Swarm Robot 09

**This guide assumes that the Mother is at `192.168.50.1` and the robot is at `192.168.50.100`. The Robot ID is `09`.**
This guide documents the complete setup for the **Yahboom Raspbot V2 ( with Raspberry Pi 5)**  so it can be used as a child robot in the swarm system.
The final behavior must be similar to the ESP32 child robots:

```text
Power ON
   ↓
Raspberry Pi boots
   ↓
Connects automatically to JetsonSwarm Wi-Fi
   ↓
raspbot09.service starts automatically
   ↓
Connects to Mosquitto on the Jetson mother
   ↓
Subscribes to swarm/robot/09/cmd
   ↓
Existing GUI can command Robot ID 09
```

---

## 1. Hardware

The tested setup is:

- Yahboom Raspbot V2
- Raspberry Pi 5
- Raspbot V2 motor-controller board connected through I2C
- Jetson mother running the `JetsonSwarm` Wi-Fi network and Mosquitto
- Existing a simple Python GUI on a Linux Laptop

The Raspberry Pi user used in this setup is:
```text
username: robot09
```

The robot ID is:
```text
09
```

---

## 2. Install Raspberry Pi OS

Use:

**Raspberry Pi OS Legacy Lite 64-bit — Debian 12 Bookworm**

A headless installation is sufficient. Enable SSH before first boot. After boot, connect using SSH.

Example:
```bash
ssh robot09@10.42.0.58
```

---

## 3. Install Required Packages

Update the package list:
```bash
sudo apt update
```

Install the basic tools:
```bash
sudo apt install -y \
    python3 \
    python3-full \
    python3-pip \
    python3-venv \
    python3-setuptools \
    python3-smbus \
    i2c-tools \
    git \
    unzip \
    curl \
    wget \
    mosquitto-clients
```

---

## 4. Enable I2C

Enable I2C:
```bash
sudo raspi-config nonint do_i2c 0
```

Reboot:
```bash
sudo reboot
```

After reconnecting, verify that the I2C device exists:
```bash
ls -l /dev/i2c-1
```

Expected:
```text
/dev/i2c-1
```

Scan the bus:
```bash
i2cdetect -y -a 1
```

On the tested Raspbot V2 we found:
```text
0x2b  → Raspbot V2 controller
0x3c  → onboard OLED/display
```

The important address is:
```text
0x2b
```

---

## 5. Install the Raspbot V2 Python Library

The working library package is (https://github.com/nbourre/raspbotv2-lib/archive/refs/heads/master.zip):
```text
raspbotv2-lib-master
```

The extracted folder should look similar to:

```text
CHANGELOG.md
LICENSE
README.md
docs/
examples/
lib/
pyproject.toml
src/
tests/
```

Create the robot project directory:
```bash
mkdir -p ~/works/raspbot_robot
cd ~/works/raspbot_robot
```

Create a Python virtual environment:
```bash
python3 -m venv --system-site-packages .venv
```

Activate it:
```bash
source .venv/bin/activate
```

Upgrade pip:
```bash
python -m pip install --upgrade pip
```

Install the Raspbot library:
```bash
python -m pip install ~/raspbotv2-lib-master
```

A successful installation ends with something similar to:
```text
Successfully built raspbot
Successfully installed raspbot-0.1.2
```

---

## 6. Test the Raspbot Library

Test whether the library can initialize the hardware:
```bash
python - <<'PY'
from raspbot import Robot

print("raspbot import OK")

with Robot() as bot:
    print("Raspbot V2 initialized OK")

print("Done")
PY
```

Expected output:
```text
raspbot import OK
Raspbot V2 initialized OK
Done
```

---

## 7. Verify Motor Mapping

The tested Raspbot motor mapping is:
```text
L1 = front-left
L2 = rear-left
R1 = front-right
R2 = rear-right
```

The Raspbot library convention was experimentally verified as:
```text
positive speed = physical forward
negative speed = physical reverse
```

For example:
```python
bot.motors.drive(MotorId.L1, 60)
```
rotates the front-left wheel in the physical forward direction.

All four motors were verified:
```text
L1 = front-left,  +60 = forward
L2 = rear-left,   +60 = forward
R1 = front-right, +60 = forward
R2 = rear-right,  +60 = forward
```

---

## 8. Existing Swarm MQTT Protocol

The existing ESP32 robots use the following MQTT command packet:
```text
<BBHhhH
```

Fields:
```text
byte 0      protocol version
byte 1      command type
bytes 2–3   sequence number
bytes 4–5   left PWM, int16
bytes 6–7   right PWM, int16
bytes 8–9   watchdog timeout, uint16 milliseconds
```

The telemetry packet is:
```text
<BBHHHhhH
```

Robot 09 keeps this protocol unchanged so that the existing GUI can communicate with it.
MQTT topics are:

```text
swarm/robot/09/cmd
swarm/robot/09/telemetry
swarm/robot/09/status
```

---

## 9. Motor Sign Compatibility

The existing swarm GUI uses:
```text
negative PWM = physical forward
positive PWM = physical reverse
```

The Raspbot Python library uses:
```text
positive speed = physical forward
negative speed = physical reverse
```

Therefore Robot 09 performs this conversion internally:
```text
hardware_speed = -protocol_pwm
```

Example:
```text
GUI sends:

left  = -60
right = -60

Robot 09 converts to:

L1 = +60
L2 = +60
R1 = +60
R2 = +60

Result:

physical forward
```

The GUI therefore does **not** need to be modified.

---
## 10. Differential Compatibility Mode

Although the Raspbot V2 has four independently controlled mecanum wheels, Robot 09 currently exposes the same two-channel interface used by the existing robots:
```text
left_pwm  → L1 + L2
right_pwm → R1 + R2
```

This provides:
```text
Forward
Backward
Turn left
Turn right
Stop
```

Native mecanum strafing can be added later as a protocol extension.

---
## 11. Install MQTT Python Support

Activate the virtual environment:
```bash
cd ~/works/raspbot_robot
source .venv/bin/activate
```

Install Paho MQTT:
```bash
python -m pip install paho-mqtt
```

---
## 12. Install the Robot 09 Daemon

Place:
```text
raspbot09_daemon.py
```

in:
```text
~/works/raspbot_robot/
```

The directory should contain:
```text
~/works/raspbot_robot/
├── .venv/
└── raspbot09_daemon.py
```

The daemon performs:
```text
MQTT connection
command decoding
left/right PWM conversion
Raspbot motor control
watchdog timeout
telemetry publishing
status publishing
safe motor stop on communication loss
```

---
## 13. Configure JetsonSwarm Wi-Fi

Connect the Raspberry Pi to the Jetson mother Wi-Fi:
```bash
sudo nmcli dev wifi connect JetsonSwarm \
    password swarmrobot123
```

A successful connection prints something similar to:
```text
Device 'wlan0' successfully activated
```

Verify the Wi-Fi address:
```bash
ip -4 addr show wlan0
```

On the tested robot:
```text
192.168.50.100
```

The Jetson mother is:
```text
192.168.50.1
```

Test connectivity:
```bash
ping -c 3 192.168.50.1
```

Expected:
```text
0% packet loss
```

Enable automatic Wi-Fi reconnection:
```bash
sudo nmcli connection modify JetsonSwarm connection.autoconnect yes
```

Verify:
```bash
nmcli -f NAME,AUTOCONNECT,DEVICE connection show
```

Expected:
```text
JetsonSwarm    yes    wlan0
```

---

## 14. Manually Test the Robot 09 Daemon

Run:
```bash
cd ~/works/raspbot_robot
source .venv/bin/activate

python raspbot09_daemon.py \
    --robot-id 09 \
    --broker 192.168.50.1 \
    --port 1883
```

Expected startup:
```text
Raspbot V2 Robot 09 MQTT daemon
Robot ID : 09
Broker   : 192.168.50.1:1883
CMD      : swarm/robot/09/cmd
Protocol : negative PWM = physical forward
Backend  : Raspbot positive speed = physical forward
Raspbot motor backend initialized
MQTT connected rc=0
Subscribed to swarm/robot/09/cmd
```

At this point the existing GUI can be used. Set:
```text
Robot ID = 09
```

A Forward command at speed 60 should produce something similar to:
```text
CMD seq=... left=-60 right=-60 timeout=500
```

Releasing the button should send an immediate stop.

---

## 15. Command Watchdog

Robot 09 uses the same watchdog idea as the ESP32 robots. Example:
```text
watchdog timeout = 500 ms
```

If command packets stop arriving for longer than the timeout:
```text
Command watchdog timeout: motors stopped
```

This prevents a communication failure from leaving the robot moving indefinitely.

---

## 16. Create the systemd Service

Create:
```bash
sudo nano /etc/systemd/system/raspbot09.service
```

Use:
```ini
[Unit]
Description=STRIDE Raspbot V2 Robot 09
After=NetworkManager.service network-online.target
Wants=network-online.target

[Service]
Type=simple
User=stride
Group=stride
SupplementaryGroups=i2c

WorkingDirectory=/home/stride/works/raspbot_robot

ExecStart=/home/stride/works/raspbot_robot/.venv/bin/python /home/stride/works/raspbot_robot/raspbot09_daemon.py --robot-id 09 --broker 192.168.50.1 --port 1883

Environment=PYTHONUNBUFFERED=1

Restart=always
RestartSec=2

TimeoutStopSec=5

[Install]
WantedBy=multi-user.target
```

---

## 17. Enable the Service

Reload systemd:
```bash
sudo systemctl daemon-reload
```

Enable automatic startup:
```bash
sudo systemctl enable raspbot09.service
```

Start it immediately:
```bash
sudo systemctl start raspbot09.service
```

Or enable and start in one command:
```bash
sudo systemctl enable --now raspbot09.service
```

---

## 18. Verify the Service

Check status:
```bash
systemctl status raspbot09.service
```

Successful output should contain:
```text
Loaded: loaded
Active: active (running)
```

and:
```text
Raspbot V2 Robot 09 MQTT daemon
Robot ID : 09
Broker   : 192.168.50.1:1883
Raspbot motor backend initialized
MQTT connected rc=0
Subscribed to swarm/robot/09/cmd
```

---

## 19. View Live Logs

Use:
```bash
journalctl -u raspbot09.service -f
```

Useful messages include:
```text
MQTT connected rc=0
Subscribed to swarm/robot/09/cmd
CMD seq=...
STOP seq=...
Command watchdog timeout: motors stopped
```

Press:
```text
Ctrl+C
```
to leave the log viewer. This does not stop the daemon.

---

## 20. Useful Service Commands

Start:
```bash
sudo systemctl start raspbot09.service
```

Stop:
```bash
sudo systemctl stop raspbot09.service
```

Restart:
```bash
sudo systemctl restart raspbot09.service
```

Status:

```bash
systemctl status raspbot09.service
```

Disable automatic boot:
```bash
sudo systemctl disable raspbot09.service
```

Re-enable:
```bash
sudo systemctl enable raspbot09.service
```

---

## 21. Enable SSH at Boot

For maintenance access:
```bash
sudo systemctl enable --now ssh
```

This is not required for robot operation, but it is useful for debugging.

---

## 22. Remove the Ethernet Cable

Before removing Ethernet, verify:
```bash
ip -4 addr show wlan0
```

Test the Jetson connection:
```bash
ping -c 3 192.168.50.1
```

Once this works, the Ethernet cable is no longer required. On the tested setup:
```text
Jetson mother: 192.168.50.1
Raspbot 09:    192.168.50.100
```

From the Jetson mother:
```bash
ping 192.168.50.100
```

SSH if needed:
```bash
ssh stride@192.168.50.100
```

---

## 23. Final Network Architecture

```text
                 Jetson Mother
                 192.168.50.1
                       │
                 Mosquitto MQTT
                       │
                 JetsonSwarm Wi-Fi
                       │
                       ▼
             Raspberry Pi 5 / Robot 09
                 192.168.50.100
                       │
              raspbot09.service
                       │
              raspbot09_daemon.py
                       │
                    I2C
                       │
                    0x2b
                       │
               Raspbot V2 board
                       │
             L1   L2   R1   R2
```

---

## 24. GUI Operation

The existing swarm GUI can be used unchanged. Set:

```text
Robot ID: 09
```

The GUI automatically uses:
```text
swarm/robot/09/cmd
swarm/robot/09/telemetry
swarm/robot/09/status
```

For initial testing, use a low speed such as:
```text
60
```

Test:
```text
Forward
Backward
Left
Right
Stop
```

---

## 25. Final Power-Cycle Test

The final test is to completely power off the Raspbot and power it on again. Do **not** manually SSH in or start the Python program. The expected sequence is:
```text
Raspberry Pi boots
      ↓
NetworkManager starts
      ↓
JetsonSwarm reconnects automatically
      ↓
raspbot09.service starts
      ↓
Raspbot hardware initializes
      ↓
MQTT connects to 192.168.50.1
      ↓
swarm/robot/09/status = online
      ↓
GUI can command Robot 09
```

If this works, the Raspberry Pi behaves like a normal autonomous child robot in the swarm.

---

## 26. Quick Rebuild Checklist

For a fresh Raspberry Pi:
```text
1. Flash Raspberry Pi OS Bookworm Lite 64-bit
2. Configure user stride and enable SSH
3. Install Python, I2C, git, unzip, and MQTT tools
4. Enable I2C
5. Confirm 0x2b with i2cdetect
6. Install raspbotv2-lib-master
7. Create ~/works/raspbot_robot
8. Create .venv with --system-site-packages
9. Install raspbot and paho-mqtt
10. Verify Robot() initializes
11. Verify L1/L2/R1/R2 motor mapping
12. Copy raspbot09_daemon.py
13. Connect to JetsonSwarm
14. Enable JetsonSwarm autoconnect
15. Verify ping to 192.168.50.1
16. Test daemon manually
17. Create /etc/systemd/system/raspbot09.service
18. systemctl daemon-reload
19. systemctl enable --now raspbot09.service
20. Verify MQTT subscription
21. Remove Ethernet
22. Power-cycle and verify Robot 09 appears automatically
```

---

## 27. Troubleshooting

**Raspbot does not initialize**
Check I2C:
```bash
i2cdetect -y -a 1
```

Confirm:
```text
0x2b
```

Check permissions:
```bash
ls -l /dev/i2c-1
groups
```

The service explicitly adds the `i2c` supplementary group.

---

**MQTT does not connect**

Check Wi-Fi:
```bash
nmcli device status
```

Check the Pi address:
```bash
ip -4 addr show wlan0
```

Check Jetson connectivity:
```bash
ping -c 3 192.168.50.1
```

Check MQTT port:
```bash
nc -vz 192.168.50.1 1883
```

---

**Service is failing repeatedly**

Check:
```bash
systemctl status raspbot09.service
```

Then:
```bash
journalctl -u raspbot09.service -n 100 --no-pager
```

---

**Test manually without `systemd`**

Stop the service:
```bash
sudo systemctl stop raspbot09.service
```

Activate the virtual environment:
```bash
cd ~/works/raspbot_robot
source .venv/bin/activate
```

Run:
```bash
python raspbot09_daemon.py \
    --robot-id 09 \
    --broker 192.168.50.1
```

Do not run the manual daemon and the systemd service at the same time.

---

## 28. Current Robot 09 Summary

```text
Robot ID             : 09
Platform             : Yahboom Raspbot V2
Computer             : Raspberry Pi 5
Motor interface      : I2C
Raspbot controller   : 0x2b
OLED                  : 0x3c
Wi-Fi                 : JetsonSwarm
Jetson MQTT broker    : 192.168.50.1:1883
Robot Wi-Fi IP tested : 192.168.50.100
Command topic         : swarm/robot/09/cmd
Telemetry topic       : swarm/robot/09/telemetry
Status topic          : swarm/robot/09/status
Daemon                : raspbot09_daemon.py
Service               : raspbot09.service
Startup               : automatic
Ethernet required     : no
```

The Raspbot is therefore integrated into the same MQTT-based swarm-control architecture as the existing ESP32 robots while retaining the option to add native mecanum control later.

---
## Assets

| Files                                                | Descriptions |
| ---------------------------------------------------- | ------------ |
| [raspbot09_daemon.py](raspbot09_daemon.py)           |              |
| [raspbot09.service](raspbot09.service)               |              |
| [raspbotv2-lib-master.zip](raspbotv2-lib-master.zip) |              |
| [gui.py](gui.py)                                     |              |
