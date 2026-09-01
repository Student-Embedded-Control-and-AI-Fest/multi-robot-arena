# Vision calibration for N cameras
For now, N = 2. All cameras must be able to see the same checkerboard on the floor.

![600](./attachments/Pasted%20image%2020260808194300.png)

Multi-camera tracker, currently with two cameras. `Camera-1` is typically in `/dev/video0` and `Camera-2` is in `/dev/video 2` .

## Assets

| Assets                                              | Description                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ![camera_config.json](camera_config.json)           | Camera configurations, such as resolution and frame rate                               |
| ![multi_camera_tracker.py](multi_camera_tracker.py) | Grabs a live frame from each camera, apply homographies,  fuse poses                   |
| ![combine_cameras.py](combine_cameras.py)           | Grabs one live frame from each camera defined in `camera_config.json` and stitch them. |

## Individual calibration
Finding homography is done separately. Place the checkerboard where all cameras can see it, calibrate every camera. Do not move any camera afterward.

For  `Camera-1`:
```bash
auralius@auralius-x270:~/works/swarm_robot_mqtt/jetson$ python3 compute_checkerboard_homography.py c1.jpg --inner-cols 7 --inner-rows 7 --square-size 0.058 --output checkerboard_homography1.json --annotated checkerboard_homography_debug.jpg --rectified checkerboard_rectified.jpg --rectified-axes checkerboard_rectified_axes.jpg

Image: c1.jpg
Detection method: automatic_classic
Board: 8 x 8 squares, 58.0 mm per square
Physical patterned area: 464.0 x 464.0 mm
Homography fit RMSE: 0.3284 mm
Maximum fit error: 0.5773 mm

H_image_to_world_m:
[[ 1.1306799712e-03  2.8362680256e-04 -7.3685653449e-01]
 [ 1.4735530679e-04 -1.2386380931e-03  4.6724492800e-01]
 [-1.1189327700e-05  2.4792996192e-04  1.0000000000e+00]]

H_world_m_to_image:
[[ 9.3911442957e+02  3.2331451228e+02  5.4092553806e+02]
 [ 1.0579197105e+02 -7.7822729157e+02  4.4157625998e+02]
 [-1.5720940253e-02  1.9656353479e-01  1.0000000000e+00]]

Saved calibration: checkerboard_homography1.json
Saved debug image: checkerboard_homography_debug.jpg
Saved plain rectified image: checkerboard_rectified.jpg
Saved rectified axes image: checkerboard_rectified_axes.jpg
Rectified scale: 1.000 mm/px

```

For `Camera-2`:
```bash
auralius@auralius-x270:~/works/swarm_robot_mqtt/jetson$ python3 compute_checkerboard_homography.py c2.jpg --inner-cols 7 --inner-rows 7 --square-size 0.058 --output checkerboard_homography2.json --annotated checkerboard_homography_debug.jpg --rectified checkerboard_rectified.jpg --rectified-axes checkerboard_rectified_axes.jpg

Image: c2.jpg
Detection method: automatic_classic
Board: 8 x 8 squares, 58.0 mm per square
Physical patterned area: 464.0 x 464.0 mm
Homography fit RMSE: 0.4348 mm
Maximum fit error: 0.8055 mm

H_image_to_world_m:
[[ 1.2045231679e-03 -5.7516627257e-05 -1.7812558105e+00]
 [ 8.6949982168e-05 -1.3824651494e-03  5.8132773851e-01]
 [ 2.9319174525e-05  2.8641071570e-04  1.0000000000e+00]]

H_world_m_to_image:
[[ 9.3299246903e+02  2.7264867767e+02  1.5034000174e+03]
 [ 4.2106675058e+01 -7.5698131118e+02  5.1505699333e+02]
 [-3.9414371969e-02  2.0881372494e-01  1.0000000000e+00]]

Saved calibration: checkerboard_homography2.json
Saved debug image: checkerboard_homography_debug.jpg
Saved plain rectified image: checkerboard_rectified.jpg
Saved rectified axes image: checkerboard_rectified_axes.jpg
Rectified scale: 1.000 mm/px
auralius@auralius-x270:~/works/swarm_robot_mqtt/jetson$ 
```


![600](./attachments/Pasted%20image%2020260808195829.png)
`Camera-1` view

![600](./attachments/Pasted%20image%2020260808195854.png)
`Camera-2` view

```bash
python3 combine_cameras.py \
  --config camera_config.json \
  --x-min -1.5 \
  --x-max 1.0 \
  --y-min -0.8 \
  --y-max 1.0 \
  --output combined_cameras.jpg
```

![600](./attachments/Pasted%20image%2020260808195950.png)
Combined view

## Issues

The checkerboard is placed on the floor, while the robot’s ArUco marker is mounted above the floor, so the two are not located on the same plane. For a camera mounted approximately 2 m above the floor and an ArUco marker positioned about 6 cm above the floor, the resulting tracking error is expected to remain below roughly 5%. This error is smooth and systematic rather than random, so it does not significantly disturb the controller behavior.

A more accurate, permanent solution is to compensate for this height difference using the camera intrinsic parameters and the corresponding camera geometry.