
# Demonstrations
## Leader-Follower

```
        Robot 3         Robot 1        Robot 2
      [ LEADER ] <---- [FOLLOW] <---- [FOLLOW]
                 20 cm          20 cm

```

```bash
cd ~/works/new_controllers

/usr/bin/python3 swarm_leader_follower.py \
    --leader-id 3 \
    --follower-id 1 \
    --follow-distance 0.20 \
    --live \
    --auto-start
    
    
cd ~/works/new_controllers

/usr/bin/python3 swarm_leader_follower.py \
    --leader-id 3 \
    --follower-id 2 \
    --follow-distance 0.20 \
    --live \
    --auto-start
```

## Encirclement

```
                  target ●
                       ↗
                  [2] ↗
                .       .
              .           .
             .    [1]      .
              .           .
                .       .

             Robot 1 = center
             Robot 2 = orbiter
```

```
Robot 1 pose
     ↓
compute Robot 2 polar angle around Robot 1
     ↓
put virtual target 30° ahead on 30-cm circle
     ↓
desired bearing
     ↓
existing P steering
     ↓
Robot 2 continuously circles Robot 1
```

```bash
/usr/bin/python3 swarm_encirclement.py \
    --center-id 1 \
    --orbiter-id 2 \
    --radius 0.30 \
    --direction ccw \
    --lookahead-deg 30 \
    --live \
    --auto-start
```

## Dynamic obstacle avoidance

```bash
 /usr/bin/python3 swarm_receding_green_worldmask.py     --robot-id 1     --show-map     --show-detector     --steer-kp 3.0     --steer-max 60     --turn-slowdown-start-deg 7     --turn-drive-pwm 150     --stop-lead-deg 18     --realign-threshold-deg 25     --obstacle-margin 0.03     --obstacle-stop-angle-deg 40     --live
```