import React, { useEffect, useRef, useState } from "react";
import { Pose } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import * as drawingUtils from "@mediapipe/drawing_utils";

export default function App() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [reps, setReps] = useState(0);
    const [status, setStatus] = useState("Waiting...");
    const [isWebcam, setIsWebcam] = useState(false);

    useEffect(() => {
        const videoElement = videoRef.current;
        const canvasElement = canvasRef.current;
        const ctx = canvasElement.getContext("2d");

        // === Pose Instance ===
        const poseInstance = new Pose({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        poseInstance.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        // State variables
        let repCount = 0;
        let state = "closed";
        let timerStarted = false;
        let startTime = null;

        poseInstance.onResults((results) => {
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            if (results.image) {
                ctx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
            }

            if (results.poseLandmarks) {
                const lm = results.poseLandmarks;

                // Calculate conditions
                const avgWristY = (lm[15].y + lm[16].y) / 2;
                const avgShoulderY = (lm[11].y + lm[12].y) / 2;
                const ankleDist = Math.abs(lm[27].x - lm[28].x);

                const handsUp = avgWristY < avgShoulderY - 0.1;
                const feetApart = ankleDist > 0.25;
                const feetTogether = ankleDist < 0.15;

                // Start timer when correct position is hit
                if (!timerStarted && handsUp && feetApart) {
                    timerStarted = true;
                    startTime = Date.now();
                }

                if (timerStarted) {
                    if (handsUp && feetApart && state === "closed") {
                        state = "open";
                    } else if (!handsUp && feetTogether && state === "open") {
                        state = "closed";
                        repCount++;
                        setReps(repCount);
                    }

                    const elapsed = (Date.now() - startTime) / 1000;
                    setStatus(`Reps: ${repCount} | Time: ${Math.floor(elapsed)}s`);
                } else {
                    setStatus("Waiting for hands up + feet apart...");
                }

                drawingUtils.drawConnectors(ctx, lm, Pose.POSE_CONNECTIONS, {
                    color: "#00FF00",
                    lineWidth: 2,
                });
                drawingUtils.drawLandmarks(ctx, lm, {
                    color: "#FF0000",
                    lineWidth: 1,
                });
            }
        });

        // Webcam Setup
        if (isWebcam) {
            const camera = new Camera(videoElement, {
                onFrame: async () => {
                    await poseInstance.send({ image: videoElement });
                },
                width: 640,
                height: 480,
            });
            camera.start();
        } else {
            // For video upload, process frames manually
            const handleFrame = async () => {
                await poseInstance.send({ image: videoElement });
                if (!videoElement.paused && !videoElement.ended) {
                    requestAnimationFrame(handleFrame);
                }
            };
            videoElement.onplay = handleFrame;
        }
    }, [isWebcam]);

    // === Upload Handler ===
    const handleVideoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setIsWebcam(false);
            videoRef.current.src = URL.createObjectURL(file);
            videoRef.current.load();
            videoRef.current.play();
        }
    };

    // === Start Webcam ===
    const startWebcam = async () => {
        setIsWebcam(true);
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        videoRef.current.play();
    };

    return (
        <div
            style={{
                textAlign: "center",
                background: "#111",
                color: "white",
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",     // Center horizontally
                justifyContent: "flex-start",
                paddingTop: "20px",
            }}
        >
            <h2>Jumping Jacks Tracker</h2>
            <p>{status}</p>
            <div style={{ marginBottom: "10px" }}>
                <button onClick={startWebcam}>📷 Start Webcam</button>
                <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    style={{ marginLeft: "10px" }}
                />
            </div>
            <video ref={videoRef} style={{ display: "none" }} />
            <canvas
                ref={canvasRef}
                style={{
                    marginTop: "15px",
                    maxWidth: "90%",
                    border: "2px solid #444",
                }}
            />
        </div>
    );

}
