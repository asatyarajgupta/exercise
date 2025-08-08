import React, { useEffect, useRef, useState } from "react";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import * as drawingUtils from "@mediapipe/drawing_utils";

export default function JumpingJacks() {
    const repCountRef = useRef(0);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [reps, setReps] = useState(0);
    const [status, setStatus] = useState("Waiting...");
    const [isWebcam, setIsWebcam] = useState(false);
    const poseInstance = useRef(null); // ⬅️ Use ref to persist pose instance
    // new stuff
    // const [startTime, setStartTime] = useState(null);
    const startTimeRef = useRef(null);

    const [endTime, setEndTime] = useState(null);
    // const [poseScores, setPoseScores] = useState([]);
    const poseScoresRef = useRef([]);

    const [summary, setSummary] = useState(null);
    const [pauseTime, setPauseTime] = useState(0);
    const [stamina, setStamina] = useState("");
    const pauseStartRef = useRef(null);



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
        // let startTime = null;

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
                    startTimeRef.current = Date.now();
                }

                if (timerStarted) {
                    // const now = Date.now();

                    if (handsUp && feetApart && state === "closed") {
                        state = "open";
                    } else if (!handsUp && feetTogether && state === "open") {
                        state = "closed";
                        repCount++;
                        setReps(repCount);
                        repCountRef.current++;
                        setReps(repCountRef.current);

                    }else {
                        // This is the "pause" state
                        if (!pauseStartRef.current) {
                            pauseStartRef.current = Date.now();  // pause started
                        }
                    }

                    const elapsed = (Date.now() - startTimeRef.current) / 1000;
                    const score = results.poseLandmarks.reduce((sum, lm) => sum + lm.visibility, 0) / results.poseLandmarks.length;
                    // setPoseScores((prev) => [...prev, score]);
                    poseScoresRef.current.push(score);
                    // const avgScore = poseScores.reduce((a, b) => a + b, 0) / poseScores.length;
                    const scores = poseScoresRef.current;
                    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

                    if (pauseStartRef.current && (handsUp && feetApart || !handsUp && feetTogether)) {
                        const pauseDuration = (Date.now() - pauseStartRef.current) / 1000;
                        setPauseTime(prev => prev + pauseDuration);
                        pauseStartRef.current = null;
                    }


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
    function evaluateStamina(age, weight, reps, duration, avgScore, pauseTime) {
        let score = 0;
        duration = duration > 0 ? duration : 1;
        const repRate = (reps / duration) * 60;

        // Repetition Rate
        if (repRate > 30) score += 2;
        else if (repRate >= 20) score += 1;

        // Pose Quality
        if (avgScore > 0.8) score += 2;
        else if (avgScore >= 0.6) score += 1;

        // Pause Time
        if (pauseTime < 5) score += 2;
        else if (pauseTime < 10) score += 1;

        // Age
        if (age < 25) score += 2;
        else if (age <= 35) score += 1;

        // Final Levels
        if (score >= 8) return "Elite 💎";
        else if (score >= 7) return "Excellent 💪";
        else if (score >= 5) return "Good 🙂";
        else if (score >= 3) return "Average 😐";
        else return "Needs Improvement 😓";
    }

    function calculateCaloriesDynamic(reps, durationSec, weightKg, age, gender, exerciseType = "generic") {
        const durationMin = durationSec / 60;
        if (durationMin === 0) return 0.0;

        let bmr;
        if (gender.toLowerCase() === "male" || gender.toLowerCase() === "m") {
            bmr = 10 * weightKg + 6.25 * 170 - 5 * age + 5;
        } else {
            bmr = 10 * weightKg + 6.25 * 160 - 5 * age - 161;
        }

        const caloriesPerMin = bmr / 1440;
        const multiplierMap = {
            jumping_jacks: 8,
            high_knees: 8.5,
            squats: 6.5,
            pushups: 7.0,
            generic: 6.0
        };
        const multiplier = multiplierMap[exerciseType.toLowerCase()] || 6.0;
        const totalCalories = caloriesPerMin * durationMin * (multiplier / 1.5);

        return parseFloat(totalCalories.toFixed(2));
    }


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
        // setPoseScores([]);
        poseScoresRef.current = [];

        setPauseTime(0);
        repCountRef.current = 0;

        const file = e.target.files[0];
        if (!file) return;

        setIsWebcam(false);
        const video = videoRef.current;
        video.src = URL.createObjectURL(file);
        video.onloadeddata = () => {
            video.play();
            processFrameLoop();
        };
        video.onended = () => {
            // const totalTime = (Date.now() - startTime) / 1000;
            const totalTime = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;

            // const avgScore = poseScores.reduce((a, b) => a + b, 0) / poseScores.length;
            const scores = poseScoresRef.current;
            const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

            // const summaryData = {
            //     name: "Anonymous",
            //     age: 20,
            //     gender: "Unspecified",
            //     weight: 70,
            //     duration_sec: totalTime.toFixed(1),
            //     reps: repCountRef.current,
            //     avg_pose_score: avgScore.toFixed(2),
            //     pause_time: pauseTime.toFixed(1),
            //     stamina: avgScore > 0.7 ? "High" : "Low",
            //     calories: (0.1 * reps + 0.035 * totalTime).toFixed(2),
            // };
            const user = {
                name: "Adi",
                age: 18,
                gender: "Male",
                weight: 65,
            };
            const staminaLevel = evaluateStamina(user.age, user.weight, repCountRef.current, totalTime, avgScore, pauseTime);
            const caloriesBurned = calculateCaloriesDynamic(repCountRef.current, totalTime, user.weight, user.age, user.gender, "jumping_jacks");

            const summaryData = {
                ...user,
                duration_sec: totalTime.toFixed(1),
                reps: repCountRef.current,
                avg_pose_score: avgScore.toFixed(2),
                pause_time: pauseTime.toFixed(1),
                stamina: staminaLevel,
                calories: caloriesBurned.toFixed(2),
            };

            setSummary(summaryData);
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
                <button
                    onClick={() => {
                        const video = videoRef.current;
                        if (video.srcObject) {
                            video.srcObject.getTracks().forEach((track) => track.stop());
                        }
                        // const totalTime = (Date.now() - startTime) / 1000;
                        const totalTime = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;

                        // const avgScore = poseScores.reduce((a, b) => a + b, 0) / poseScores.length;
                        // const avgScore = poseScores.length
                        //     ? poseScores.reduce((a, b) => a + b, 0) / poseScores.length
                        //     : 0;
                        const scores = poseScoresRef.current;
                        const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

                        const user = {
                            name: "Adi",
                            age: 18,
                            gender: "Male",
                            weight: 65,
                        };
                        const staminaLevel = evaluateStamina(user.age, user.weight, repCountRef.current, totalTime, avgScore, pauseTime);
                        const caloriesBurned = calculateCaloriesDynamic(repCountRef.current, totalTime, user.weight, user.age, user.gender, "jumping_jacks");

                        const summaryData = {
                            ...user,
                            duration_sec: totalTime.toFixed(1),
                            reps: repCountRef.current,
                            avg_pose_score: avgScore.toFixed(2),
                            pause_time: pauseTime.toFixed(1),
                            stamina: staminaLevel,
                            calories: caloriesBurned.toFixed(2),
                        };

                        setSummary(summaryData);
                    }}
                    style={{ marginLeft: "10px" }}
                >
                    🛑 Stop Webcam
                </button>

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
            {summary && (
                <div style={{ background: "#222", padding: "20px", marginTop: "20px", borderRadius: "8px" }}>
                    <h3>📝 Workout Summary</h3>
                    <p>Name: {summary.name}</p>
                    <p>Age: {summary.age}   Gender: {summary.gender}</p>
                    <p>Weight: {summary.weight} kg</p>
                    <p>Duration: {summary.duration_sec} seconds</p>
                    <p>Repetitions: {summary.reps}</p>
                    <p>Average Pose Score: {summary.avg_pose_score}</p>
                    <p>Pause Time: {summary.pause_time} seconds</p>
                    <p>Stamina Level: {summary.stamina}</p>
                    <p>Calories Burned: {summary.calories} kcal</p>
                </div>
            )}

        </div>
    );
}
