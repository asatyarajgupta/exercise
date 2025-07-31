import React, { useEffect, useRef, useState } from "react";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import * as drawingUtils from "@mediapipe/drawing_utils";

export default function App() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [reps, setReps] = useState(0);
    const [status, setStatus] = useState("Waiting...");
    const [isWebcam, setIsWebcam] = useState(false);
    const poseInstance = useRef(null); // ⬅️ Use ref to persist pose instance

    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        // Setup Pose
        poseInstance.current = new Pose({
            locateFile: (file) =>
                `/node_modules/@mediapipe/pose/${file}`, // ← not necessary in dev, but kept explicit
        });

        poseInstance.current.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        let repCount = 0;
        let state = "closed";
        let timerStarted = false;
        let startTime = null;

        poseInstance.current.onResults((results) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.image) {
                ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            }

            if (results.poseLandmarks) {
                const lm = results.poseLandmarks;
                const avgWristY = (lm[15].y + lm[16].y) / 2;
                const avgShoulderY = (lm[11].y + lm[12].y) / 2;
                const ankleDist = Math.abs(lm[27].x - lm[28].x);
                const handsUp = avgWristY < avgShoulderY - 0.1;
                const feetApart = ankleDist > 0.25;
                const feetTogether = ankleDist < 0.15;

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

                drawingUtils.drawConnectors(ctx, lm, POSE_CONNECTIONS, {
                    color: "#00FF00",
                    lineWidth: 2,
                });
                drawingUtils.drawLandmarks(ctx, lm, {
                    color: "#FF0000",
                    lineWidth: 1,
                });
            }
        });

        return () => {
            // Clean up if needed
            if (video && video.srcObject) {
                video.srcObject.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    const processFrameLoop = () => {
        const video = videoRef.current;
        const pose = poseInstance.current;

        const step = async () => {
            await pose.send({ image: video });
            if (!video.paused && !video.ended) {
                requestAnimationFrame(step);
            }
        };

        requestAnimationFrame(step);
    };

    const handleVideoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsWebcam(false);
        const video = videoRef.current;
        video.src = URL.createObjectURL(file);
        video.onloadeddata = () => {
            video.play();
            processFrameLoop();
        };
    };

    const startWebcam = async () => {
        setIsWebcam(true);
        const video = videoRef.current;

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;

        const camera = new Camera(video, {
            onFrame: async () => {
                await poseInstance.current.send({ image: video });
            },
            width: 640,
            height: 480,
        });

        camera.start();
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
                alignItems: "center",
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
            <video
                ref={videoRef}
                style={{ display: "none" }}
                width={640}
                height={480}
                playsInline
                muted
            />
            <canvas
                ref={canvasRef}
                width={640}
                height={480}
                style={{
                    marginTop: "15px",
                    maxWidth: "90%",
                    border: "2px solid #444",
                }}
            />
        </div>
    );
}
