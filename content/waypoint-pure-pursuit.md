# Waypoint Path Following with Pure Pursuit

## 1. Overview

After validating point-to-point movement, the next step is to command a robot to follow a **multi-waypoint path**.

The controller keeps the same experimentally successful low-level behavior used in point-to-point control:

```text
INITIAL ROTATION
        ↓
PURE PURSUIT + P STEERING
        ↓
FINAL ROTATION
        ↓
DONE
```

Pure Pursuit is used only during the path-following phase. The initial and final rotations remain separate one-pass in-place rotation episodes with empirical predictive stopping.

The current implementation is:

```text
waypoint_gui.py
      ↓
swarm_pure_pursuit.py
      ↓
MQTT
      ↓
Robot
```

The GUI is only the frontend. The validated Pure Pursuit controller runs as a separate process, so the GUI does not duplicate or modify the control law.

---

## 2. Localization

The controller reads the robot pose from ArucoHub:

```text
x_m
y_m
theta_rad
```

The localization chain is:

```text
USB cameras
      ↓
CameraHub
      ↓
checkerboard floor homography
      ↓
60 mm marker-height compensation
      ↓
multi-camera fusion
      ↓
ArucoHub circular pose history
      ↓
Pure Pursuit controller
```

Therefore all waypoints and robot positions are defined in the same world coordinate frame:

```text
+X = right
+Y = up
0 deg = +X
+90 deg = +Y
```

---

## 3. Waypoint Representation

A path consists of a sequence of world-coordinate points:

```text
START → W1 → W2 → ... → WN
```

The current robot position is automatically used as `START`. The user only specifies the future waypoints.

For example:

```python
waypoints = [
    (0.45,  0.10),
    (0.70,  0.25),
    (1.00,  0.15),
    (1.15, -0.05),
]
```

The resulting commanded path is the polyline joining those points.

---

## 4. Controller State Machine

### 4.1 Initial rotation

At the beginning of the run, the robot is aligned approximately with the beginning of the path.

The desired initial heading is obtained from the first Pure Pursuit look-ahead direction.

The rotation uses:

```text
fixed PWM       = 140
stop lead       = 30 deg
settle time     = 500 ms
reverse action  = disabled
```

The robot intentionally stops early and relies on its measured rotational coast to finish the turn.

---

### 4.2 Pure Pursuit path following

During translation, the controller finds the closest progress point on the polyline and then selects a point farther ahead by the look-ahead distance.

For this experiment:

```text
look-ahead distance = 0.20 m
```

Conceptually:

```text
                         LOOK
                           ●
                         .'
                      .'
                   .'
robot ● ----------'
             commanded path
```

The bearing from the robot to the look-ahead point becomes the instantaneous desired heading.

The heading error is:

$$
e_\theta = \operatorname{wrap}(\theta_{look}-\theta)
$$

and the steering correction is:

$$
c=-K_p e_\theta
$$

with the heading error expressed in degrees.

The wheel magnitudes are:

$$
PWM_L = PWM_0 + c
$$

$$
PWM_R = PWM_0 - c.
$$

For the present tuning:

```text
base PWM        = 180
steering Kp     = 4 PWM/deg
steering limit  = ±35 PWM
```

There is no intermediate in-place rotation between waypoints. The robot remains in continuous forward motion and changes curvature through differential steering.

---

## 5. Goal Arrival and Final Rotation

The path-following state ends when the robot enters the final target radius:

```text
goal tolerance = 0.05 m
stable cycles  = 2
```

After the final position is accepted, the robot performs the optional final in-place rotation.

For the example experiment:

```text
requested final heading = 0 deg
```

The complete behavior is therefore:

```text
ROTATE_INITIAL
      ↓
FOLLOW_PATH
      ↓
HOLD_AT_GOAL
      ↓
ROTATE_FINAL
      ↓
DONE
```

---

## 6. Waypoint GUI

`waypoint_gui.py` combines the arena viewer and waypoint editor.

Main operations:

```text
Left click   → add waypoint
Right click  → undo last waypoint
Undo         → remove last waypoint
Clear Path   → remove all waypoints
START PATH   → launch swarm_pure_pursuit.py
EMERGENCY STOP → interrupt the active controller
```

The GUI also shows:

- numbered metric X/Y grid;
- live mouse world coordinates;
- ArucoHub robot poses;
- pose-history trails;
- selected robot;
- look-ahead distance;
- optional final heading;
- commanded waypoint polyline;
- moving Pure Pursuit look-ahead point;
- live controller output.

The `LIVE` checkbox must be enabled before real motor commands are sent. Otherwise the controller runs in dry-run mode.

---

## 7. Example Experiment — 9 August 2026

The successful Robot 1 experiment used:

```text
Initial pose:
x     = +0.203 m
y     = -0.016 m
theta = +84.8 deg
```

Commanded waypoints:

- **W1** = `(+0.45, +0.10) m`
- **W2** = `(+0.70, +0.25) m`
- **W3** = `(+1.00, +0.15) m`
- **W4** = `(+1.15, -0.05) m`

Other parameters:

```text
Path length       = 1.130 m
Look-ahead        = 0.200 m
Drive PWM         = 180
Steering Kp       = 4.00 PWM/deg
Steering limit    = ±35 PWM
Rotation PWM      = 140
Rotation stop lead= 30.0 deg
Goal tolerance    = 0.050 m
Control rate      = 10.0 Hz
Final heading     = 0 deg
```

The command was:

```bash
/usr/bin/python3 swarm_pure_pursuit.py \
    --robot-id 1 \
    --waypoint 0.45 0.10 \
    --waypoint 0.70 0.25 \
    --waypoint 1.00 0.15 \
    --waypoint 1.15 -0.05 \
    --lookahead 0.20 \
    --final-theta-deg 0 \
    --live
```

---

## 8. Experimental Trajectory

![](./attachments/Pasted%20image%2020260809202200.png)

In the figure:

```text
orange line = commanded polyline
cyan line   = measured Robot 1 trajectory from the controller log
W1 ... W4   = commanded waypoints
END         = actual stopping position before final in-place rotation
```

The final waypoint and actual stop are intentionally labeled separately:

```text
W4  = (+1.150, -0.050) m
END = (+1.122, -0.028) m
```

The measured final position error was:

```text
distance to W4 = 3.6 cm
```

which is inside the configured 5 cm target radius.

---

## 9. Observed Path-Following Performance

From the logged Pure Pursuit samples:

```text
mean cross-track error ≈ 1.7 cm
maximum cross-track error ≈ 4.8 cm
```

The larger cross-track errors occurred mainly around changes in path direction. This is expected because Pure Pursuit intentionally aims ahead of the robot and therefore tends to round or cut sharp polyline corners.

The controller remained stable and continued forward instead of stopping at each waypoint.

---

## 10. Initial Rotation Result

At the start of the experiment, the initial desired Pure Pursuit direction was approximately:

```text
desired heading ≈ +25.2 deg
```

The one-pass initial rotation finished at approximately:

```text
final heading = +23.0 deg
heading error = +2.1 deg
```

The controller then entered `FOLLOW_PATH` without reverse correction.

---

## 11. Final Rotation Result

After the robot reached the final waypoint tolerance, the controller requested:

```text
final heading = 0 deg
```

The final one-pass rotation ended at approximately:

```text
measured heading = +0.1 deg
heading error    = -0.1 deg
```

This demonstrates that the same empirical predictive rotation method used in point-to-point motion can be retained before and after Pure Pursuit.

---

## 12. Main Observation

The experiment validates the following control decomposition:

```text
Global path:
    sequence of waypoints

Reference generation:
    Pure Pursuit look-ahead point

Moving steering:
    P steering using heading error

Large stationary orientation changes:
    empirical one-pass rotation
```

The resulting architecture is:

```text
waypoints
    ↓
Pure Pursuit
    ↓
look-ahead target
    ↓
desired heading
    ↓
P steering
    ↓
differential motor PWM
```

with independent initial and final rotation states:

```text
INITIAL ROTATION
        ↓
PURE PURSUIT + P STEERING
        ↓
FINAL ROTATION
```

This gives a simple path-following controller that matches the actual nonlinear behavior of the small N20 DC-motor robots.

---

## 13. Next Step

With single-robot waypoint following validated, the next experiment is **leader–follower control**.

A natural architecture is:

```text
Robot 1
leader trajectory / Pure Pursuit
        ↓
ArucoHub leader pose
        ↓
desired follower point
at fixed offset behind leader
        ↓
Robot 2
point/path tracking
```

This allows Robot 1 to follow an arbitrary waypoint path while Robot 2 continuously generates its target from Robot 1's pose.
