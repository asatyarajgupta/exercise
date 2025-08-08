import React, { useEffect, useRef, useState } from "react";
import * as poseDetection from "@mediapipe/pose";
import * as camUtils from "@mediapipe/camera_utils";
import * as drawingUtils from "@mediapipe/drawing_utils";

export default function SquatsTracker() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [repCount, setRepCount] = useState(0);
    const [stage, setStage] = useState(null);
    const [timerStarted, setTimerStarted] = useState(false);
    const [startTime, setStartTime] = useState(null);
    const [pauseStart, setPauseStart] = useState(null);
    const [pauseTime, setPauseTime] = useState(0);
    const [poseScores, setPoseScores] = useState([]);
    // const [source, setSource] = useState("camera");
    const [source, setSource] = useState(null);

    const [videoFile, setVideoFile] = useState(null);
    const [timeLeft, setTimeLeft] = useState(30);

    const timerDuration = 30;

    const calculateAngle = (a, b, c) => {
        const radians =
            Math.atan2(c[1] - b[1], c[0] - b[0]) -
            Math.atan2(a[1] - b[1], a[0] - b[0]);
        let angle = Math.abs((radians * 180.0) / Math.PI);
        if (angle > 180.0) angle = 360 - angle;
        return angle;
    };

    useEffect(() => {
        const pose = new poseDetection.Pose({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });
        pose.setOptions({
            modelComplexity: 0,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        pose.onResults((results) => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawingUtils.drawConnectors(ctx, results.poseLandmarks, poseDetection.POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 4 });
            drawingUtils.drawLandmarks(ctx, results.poseLandmarks, { color: "#FF0000", lineWidth: 2 });

            if (results.poseLandmarks) {
                const lm = results.poseLandmarks;
                const r_hip = [lm[24].x, lm[24].y];
                const r_knee = [lm[26].x, lm[26].y];
                const r_ankle = [lm[28].x, lm[28].y];
                const l_hip = [lm[23].x, lm[23].y];
                const l_knee = [lm[25].x, lm[25].y];
                const l_ankle = [lm[27].x, lm[27].y];

                const r_angle = calculateAngle(r_hip, r_knee, r_ankle);
                const l_angle = calculateAngle(l_hip, l_knee, l_ankle);
                const squat_angle = Math.min(r_angle, l_angle);

                const score =
                    lm.reduce((sum, l) => sum + l.visibility, 0) / lm.length;
                setPoseScores((prev) => [...prev, score]);

                const now = Date.now() / 1000;

                if (!timerStarted && squat_angle < 115) {
                    setStartTime(now);
                    setTimerStarted(true);
                }

                if (timerStarted) {
                    const elapsed = now - startTime;
                    setTimeLeft(Math.max(0, Math.floor(timerDuration - elapsed)));

                    if (squat_angle < 115) {
                        setStage("down");
                    } else if (squat_angle > 160 && stage === "down") {
                        setStage("up");
                        setRepCount((prev) => prev + 1);
                    }

                    if (pauseStart !== null) {
                        setPauseTime((prev) => prev + (now - pauseStart));
                        setPauseStart(null);
                    }
                }
            } else if (timerStarted && pauseStart === null) {
                setPauseStart(Date.now() / 1000);
            }
        });

        let camera;
        if (source === "camera") {
            camera = new camUtils.Camera(videoRef.current, {
                onFrame: async () => {
                    await pose.send({ image: videoRef.current });
                },
                width: 640,
                height: 480,
            });
            camera.start();
        } else if (videoFile) {
            const video = videoRef.current;
            video.onloadeddata = async () => {
                const interval = setInterval(async () => {
                    if (video.paused || video.ended) {
                        clearInterval(interval);
                        return;
                    }
                    await pose.send({ image: video });
                }, 100);
            };
        }

        return () => {
            if (camera) camera.stop();
        };
    }, [source, videoFile, stage, pauseStart, timerStarted, startTime]);

    useEffect(() => {
        if (timeLeft === 0) {
            const totalTime = Math.floor(Date.now() / 1000 - startTime);
            const avgScore =
                poseScores.length > 0
                    ? poseScores.reduce((a, b) => a + b, 0) / poseScores.length
                    : 0;
            console.log("✅ Workout Summary:");
            console.log("Reps:", repCount);
            console.log("Time:", totalTime, "s");
            console.log("Pause Time:", Math.floor(pauseTime), "s");
            console.log("Avg Pose Score:", avgScore.toFixed(2));
        }
    }, [timeLeft]);

    return (
        <div style={{ textAlign: "center" }}>
            <h1>🏋️‍♂️ Squats Tracker</h1>
            <div>
                <button onClick={() => setSource("camera")}>Use Camera</button>
                <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                        setSource("file");
                        setVideoFile(URL.createObjectURL(e.target.files[0]));
                    }}
                />
            </div>
            <div style={{ position: "relative", width: "640px", height: "480px", margin: "auto" }}>
                <video
                    ref={videoRef}
                    src={source === "file" ? videoFile : undefined}
                    autoPlay
                    muted
                    playsInline
                    style={{ width: "640px", height: "480px", zIndex: 1 }}
                />
                <canvas
                    ref={canvasRef}
                    width="640"
                    height="480"
                    style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }}
                />
            </div>
            <h2>Reps: {repCount}</h2>
            {timerStarted && <h3>⏳ Time Left: {timeLeft}s</h3>}
        </div>
    );
}