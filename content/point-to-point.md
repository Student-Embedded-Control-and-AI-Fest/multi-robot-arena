# Point-to-Point Movement

## 1. Controller Structure

The controller uses two different strategies:

1. **One-pass in-place rotation with empirical predictive stopping**
2. **Continuous P steering during translation**

The state sequence is:

```text
ROTATE_TO_TARGET
      ↓
TRANSLATE
  + continuous P steering
  + occasional REALIGN_TO_TARGET if heading error gets too large
      ↓
GOAL_SETTLE
      ↓
ROTATE_FINAL   ← only if --final-theta-deg is given
      ↓
DONE
```

If no final heading is requested, the controller goes directly from `TRANSLATE` to `DONE` after the target position is reached.

There is no transition from `TRANSLATE` back to `ROTATE_TO_TARGET`.

---

## 2. Pose Source

The point-to-point controller does not perform image processing directly.

It reads the latest fused robot pose from ArucoHub:

```text
x_m
y_m
theta_rad
```

The vision chain is:

```text
USB cameras
     ↓
CameraHub
     ↓
floor homography
     ↓
marker-height compensation
     ↓
multi-camera fusion
     ↓
ArucoHub pose-history buffer
     ↓
point-to-point controller
```

ArucoHub already applies:

- checkerboard homography into the common world frame;
- marker-height compensation;
- multi-camera fusion;
- configured marker forward-edge orientation.

For the current robots, the ArUco marker plane is approximately:

```text
marker height = 60 mm = 0.060 m
```

Therefore the controller operates entirely in the common, height-compensated world coordinate frame.

The target position `(x_d, y_d)` refers to the position of the height-compensated ArUco marker centre. With the marker mounted approximately at the robot centre, this is used as the robot position.

---

## 3. Why Two Different Controllers?

The N20 motors behave differently when starting from rest and when already moving.

During in-place rotation, the motors do not respond reliably below about PWM 140:

```text
PWM < ~140   -> little or no rotation
PWM >= ~140  -> strong rotation
```

This makes low-amplitude P or PD control difficult. Near the target angle, the controller would ideally reduce the motor command, but the required PWM may fall below the useful range.

During forward motion, both motors are already spinning around PWM 180. Small PWM differences then produce useful steering.

For this reason:

```text
in-place rotation -> fixed PWM + predictive stopping
translation       -> proportional differential steering
```

---

## 4. Initial Rotation

The desired bearing to the target is

$$
\theta_d = \operatorname{atan2}(y_d-y,\;x_d-x)
$$

and the heading error is

$$
e_\theta = \operatorname{wrap}(\theta_d-\theta).
$$

The desired heading is latched when the rotation episode starts.

The direction is selected once:

```text
e_theta > 0 -> ROTATE_LEFT
e_theta < 0 -> ROTATE_RIGHT
```

The robot then rotates at a fixed PWM:

```text
rotation PWM = 140
```

There is no reversal within the same rotation episode.

---

## 4.1 Empirical Predictive Stopping

The robot is stopped before the heading error reaches zero.

Current tuned setting:

```text
stop lead = 30 deg
```

Under normal operation, the stopping condition is approximately

$$
|e_\theta| \le 30^\circ.
$$

The implementation also stops the rotation if the desired heading has already been crossed. This prevents the robot from continuing an unnecessary large rotation if one localization update jumps past the lead-angle region.

After the STOP command, the robot continues rotating due to inertia and wheel-floor dynamics.

The controller waits:

```text
settle time = 500 ms
```

before leaving the rotation state.

The term **predictive** is used here because the controller stops early based on the expectation that the robot will continue rotating after the motor command is removed.

The stopping angle is empirical. It was obtained from repeated experiments, not from an explicit dynamic model.

This is **not Model Predictive Control (MPC)**.

A more precise description is:

> **one-pass rotation with empirical predictive stopping**

---

## 5. Translation with P Steering

During translation, the target bearing is recomputed continuously:

$$
\theta_d = \operatorname{atan2}(y_d-y,\;x_d-x)
$$

with heading error

$$
e_\theta = \operatorname{wrap}(\theta_d-\theta).
$$

The steering correction is

$$
c=-K_p e_\theta
$$

where the heading error is expressed in degrees.

The nominal wheel PWM is:

```text
base PWM = 180
```

and the wheel magnitudes are:

$$
PWM_L = 180 + c
$$

$$
PWM_R = 180 - c.
$$

The correction is limited to:

```text
+/-35 PWM
```

and the wheel PWM magnitude is limited to:

```text
130 ... 220
```

The experimentally tuned steering gain is:

```text
Kp = 4 PWM/deg
```

There is no transition back to an in-place rotation state while translating. Moderate heading errors are corrected continuously while the robot remains in motion.

---

## 5.1 Example

For:

```text
heading error = +2 deg
```

the correction is:

$$
c=-4(2)=-8.
$$

Thus:

```text
left  magnitude = 172
right magnitude = 188
```

For:

```text
heading error = -3 deg
```

the correction is:

$$
c=-4(-3)=+12.
$$

and:

```text
left  magnitude = 192
right magnitude = 168
```

The robot therefore changes curvature while continuing to move forward.

---

## 6. P Steering Works Better Than P Rotation

For in-place rotation, the useful actuator range is strongly affected by static friction:

```text
small PWM -> insufficient torque
large PWM -> strong rotation
```

A normal P controller may request a small motor command near the target, but that command may not move the robot.

If the output is clamped to a minimum useful PWM, the behavior becomes close to bang-bang control.

During translation, this problem is much smaller because both motors are already moving. Small differences such as:

```text
176 / 184
170 / 190
160 / 200
```

produce measurable steering.

This is the main reason P steering is useful for translation while P rotation was not.

---

## 7. Current Tuned Parameters

The following are the experimentally tuned settings currently used by the point-to-point GUI:

```text
Control rate          = 10 Hz

Rotation:
  PWM                 = 140
  stop lead           = 30 deg
  settle time         = 500 ms
  reverse correction  = disabled

Translation:
  base PWM            = 180
  steering Kp         = 4 PWM/deg
  max correction      = +/-35 PWM
  min wheel PWM       = 130
  max wheel PWM       = 220
  left scale          = 1.00
  right scale         = 1.00

Position:
  target radius       = 0.05 m
  stable cycles       = 2
```

The lower-level command-line controller may contain more conservative built-in defaults. The values above are the tuned settings used in the current GUI and experiments.

---

## 8. Recommended Command

Using the generalized point-to-point controller:

```bash
cd ~/works/controllers

python3 swarm_point_to_point.py \
    0.50 0.20 \
    --robot-id 1 \
    --marker-id 1 \
    --final-theta-deg 90 \
    --live \
    --control-hz 10 \
    --rotate-pwm 140 \
    --drive-pwm 180 \
    --steer-kp 4 \
    --stop-lead-deg 30 \
    --position-tol 0.05
```

The command above gives:

```text
target x = 0.50 m
target y = 0.20 m
final heading = 90 deg
```

If `--final-theta-deg` is omitted, the controller finishes after the target position is reached and does not perform the final rotation.

---

## 9. Wheel Command Convention

Robot 1 uses signed wheel commands.

```text
FORWARD:      left  < 0   right < 0
ROTATE_LEFT:  left  > 0   right < 0
ROTATE_RIGHT: left  < 0   right > 0
```

The controller uses:

```text
drive_sign = -1
```

and the current translation calibration is:

```text
left_scale  = 1.00
right_scale = 1.00
```

The P steering loop compensates for moderate left-right motor mismatch.

---

## 10. Target Arrival

The Euclidean distance to the target is:

$$
d=\sqrt{(x_d-x)^2+(y_d-y)^2}.
$$

The current target radius is:

```text
position tolerance = 0.05 m
```

The robot must remain within this radius for:

```text
stable cycles = 2
```

consecutive pose samples before translation is considered complete.

If a final heading was requested, the controller then enters `ROTATE_FINAL`.

Otherwise it enters `DONE`.

---

## 11. Final Rotation

If a final heading is requested, the controller performs one additional in-place rotation after the position target has been reached.

The final rotation uses the same empirical one-pass strategy as the initial rotation:

```text
fixed PWM            = 140
stop lead            = 30 deg
settle time          = 500 ms
reverse correction   = disabled
```

The rotation direction is selected once at the beginning of the episode.

Under normal operation, the robot stops when the remaining heading error enters the lead-angle region. It also stops if the desired heading has already been crossed.

After the settle interval, the controller enters `DONE`.

---

## 12. Control Rate

Tests were performed at 10 Hz and 20 Hz.

The 20 Hz run did not give better overall behavior. In one run, the final rotation showed a much larger overshoot.

The 10 Hz runs were more repeatable, so the current tuned setting is:

```text
control_hz = 10
```

The localization system can run faster than the controller.

---

## 13. Experimental Results

Typical final position errors were in the range of a few centimeters.

One of the better runs reached approximately:

```text
target: x = 0.500 m y = 0.200 m
final:  x = 0.493 m y = 0.216 m
```

which corresponds to approximately:

```text
position error = 1.7 cm
```

The same run ended at:

```text
desired heading = 90.0 deg
final heading   = 91.8 deg
```

or approximately:

```text
heading error = 1.8 deg
```

The parameters were:

```text
control_hz = 10
steer_kp   = 4
stop lead  = 30 deg
```

These results were obtained before the later ArucoHub marker-height compensation update. The control law itself is unchanged, while the current localization now provides a more geometrically consistent robot position across cameras.

---

## 14. Small Initial Heading Errors

If the initial heading error is already smaller than the stop-lead angle, the current rotation state may immediately stop without applying an in-place rotation.

For example:

```text
initial error = 19 deg
stop lead     = 30 deg
```

The robot then begins translation directly.

This is acceptable because the P steering controller can correct moderate heading error while moving.

A useful practical rule is therefore:

```text
large heading error -> one-pass in-place rotation
small heading error -> start moving and let P steering correct it
```

---

## 15. Final Control Logic

```text
1. Read the latest height-compensated fused pose from ArucoHub.

2. Compute the bearing to the target.

3. Perform one in-place initial rotation if needed:
     fixed PWM = 140
     stop about 30 deg before the desired heading
     also stop if the desired heading has already been crossed
     wait 500 ms
     no reverse correction

4. Translate:
     continuously recompute target bearing
     base PWM = 180
     P steering Kp = 4 PWM/deg
     correction limited to +/-35
     wheel magnitudes limited to 130 ... 220
     no return to an in-place rotation state

5. Stop when distance <= 5 cm for two consecutive samples.

6. If a final heading was requested:
     perform one final in-place rotation
     fixed PWM = 140
     empirical predictive stop lead = 30 deg
     crossed-target safeguard enabled
     wait 500 ms
     no reverse correction

7. DONE
```

---

## 16. Main Observation

The final controller reflects the actual motor behavior:

```text
from rest:
    large static-friction effect
    -> in-place rotation behaves almost like a discrete actuator

already moving:
    small PWM changes are effective
    -> translation can use continuous P steering
```

The final design is therefore a hybrid controller:

$$
\boxed{\text{Empirical Predictive Rotation}
+\text{P-Steering Translation}
+\text{Optional Final Rotation}}
$$

For the current Robot 1 hardware, this gave the most reliable behavior while keeping the controller simple.

The same structure also provides the natural foundation for path following:

```text
Point-to-point:
Initial Rotation -> P-Steered Translation -> Final Rotation

Pure Pursuit:
Initial Rotation -> Pure Pursuit + P Steering -> Final Rotation
```
