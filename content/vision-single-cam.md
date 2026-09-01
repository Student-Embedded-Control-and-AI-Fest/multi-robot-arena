# Vision calibration for single camera

![600](Pasted%20image%2020260807204008.png)

This setup is used to test **vision-based localization** for a small wheeled robot.

## What’s in the scene
- **Checkerboard target** on the floor for camera calibration and **homography / perspective mapping** (image plane → ground plane).
- Robot with a **fiducial marker** (ArUco) for 2D **pose estimation** (position + heading) from the overhead camera.
- Small objects around the area that can be used as **obstacles/landmarks** during navigation tests.

## Goals
- Validate that the camera feed + calibration produces a stable mapping to the ground plane.
- Enable tracking / localization that can later be used for multi-robot (swarm) control.

## Assets
![](compute_checkerboard_homography.py)

This script computes a **planar homography** that maps **image pixels → floor coordinates (meters)** using a checkerboard placed on the floor.

What it does:
- Loads an input image (JPG/PNG) containing the checkerboard.
- Detects checkerboard reference points:
    - **Automatic**: finds **inner corners** with OpenCV (`findChessboardCornersSB` / `findChessboardCorners`).
    - **Manual fallback**: if detection fails (or `--manual`), you click the **4 outer patterned corners** in order (TL, TR, BR, BL).
- Builds the corresponding **world coordinates** assuming:
    - origin at the **checkerboard center**
    - **+X** to the checkerboard’s right, **+Y** to the top
    - units in **meters** (`--square-size`, default 0.058 m).
- Fits the homography (image → world) with `cv2.findHomography(..., RANSAC, ...)` and reports **RMSE / max error**.
- Saves outputs:
    - `checkerboard_homography.json`: calibration results including `H_image_to_world_m` and `H_world_m_to_image` plus error metrics.
    - `checkerboard_homography_debug.jpg`: annotated image showing detected/clicked points and axes.
    - Optional rectified top-down images: `checkerboard_rectified.jpg` and `checkerboard_rectified_axes.jpg`.

Note: the homography is valid for the **floor plane** containing the checkerboard; elevated markers (e.g., ArUco on top of the robot) can introduce a height-dependent offset.

| ![600](Pasted%20image%2020260808094704.png) |
| --------------------------------------------------------- |
| $$\Large \downarrow  \downarrow \downarrow$$              |
| ![600](Pasted%20image%2020260808094211.png) |
| $$\Large \downarrow  \downarrow \downarrow$$              |
| ![600](Pasted%20image%2020260808094422.png) |
| $$\Large \downarrow  \downarrow \downarrow$$              |
| ![600](Pasted%20image%2020260808095254.png) |

The result is stored in: `checkerboard_homography.json`

This JSON file is the saved result of a **floor-plane checkerboard homography calibration**. It stores a mapping to convert **pixel coordinates in the overhead camera image → real-world floor coordinates (meters)**, assuming points lie on the same floor plane as the checkerboard.

## Scene & checkerboard setup

- **Source image**: `brio-test.jpg` (`1920×1080` px)
- **Calibration type**: planar homography for the **floor**
- **Detection method**: `automatic_classic` (corners found automatically)
- **Checkerboard**: `8×8` squares → `7×7 = 49` inner corners used
- **Square size**: `0.058 m` (5.8 cm) → board size `0.464 m × 0.464 m`

## Coordinate system (world frame)

- **Origin**: checkerboard pattern centre
- **+X**: toward checkerboard right side; **+Y**: toward checkerboard top side
- **Units**: metres
- **Validity**: only for the **floor plane** containing the checkerboard

## Data used to fit the homography

- **`image_points_px`**: 49 detected corner points `[u, v]` in pixels
- **`world_points_m`**: matching 49 corner points `[x, y]` in metres (spaced by `0.058 m`)
- **`inlier_mask`**: all `1` → all points were accepted as inliers (RANSAC)

## Fit quality (reprojection error)

- **RMSE**: `0.0003228 m` ≈ **0.323 mm**
- **Max error**: `0.0006679 m` ≈ **0.668 mm**
- **`point_errors_mm`**: per-corner error list

## Homography matrices

- **`H_image_to_world_m`**: map **image pixels → world metres** on the floor plane
- **`H_world_m_to_image`**: inverse map **world metres → image pixels** (useful for drawing overlays)

## Rectified (top-down) view outputs

- `checkerboard_rectified.jpg`, `checkerboard_rectified_axes.jpg`
- **Rectified scale**: `px_per_m = 1000` → **1 px = 1 mm** in the rectified image
- Rectified output size: `2382×1578` px (with `padding_px = 80`)

## Practical warnings

- Homography is valid only for the floor plane; **elevated markers** (e.g., ArUco on top of the robot) may need **height compensation**.
    - **Marker height should be consistent across all robots relative to the floor plane.**
- **Keep the camera fixed after generating this calibration.**

## Issues

The checkerboard is placed on the floor, while the robot’s ArUco marker is mounted above the floor, so the two are not located on the same plane. For a camera mounted approximately 2 m above the floor and an ArUco marker positioned about 6 cm above the floor, the resulting tracking error is expected to remain below roughly 5%. This error is smooth and systematic rather than random, so it does not significantly disturb the controller behavior.

**A more accurate, permanent solution is to compensate for this height difference using the camera intrinsic parameters and the corresponding camera geometry.**