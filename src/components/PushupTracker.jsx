import React, { useEffect, useRef, useState } from "react";
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import * as drawingUtils from "@mediapipe/drawing_utils";

export default function PushupTracker() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const poseInstance = useRef(null);

    const repCountRef = useRef(0);
    const poseScoresRef = useRef([]);
    const pauseStartRef = useRef(null);
    const startTimeRef = useRef(null);

    const [reps, setReps] = useState(0);
    const [status, setStatus] = useState("Waiting...");
    const [pauseTime, setPauseTime] = useState(0);
    const [summary, setSummary] = useState(null);

    const downAngleThreshold = 90;
    const upAngleThreshold = 160;

    const calculateAngle = (a, b, c) => {
        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs((radians * 180.0) / Math.PI);
        return angle > 180 ? 360 - angle : angle;
    };

    function evaluateStamina(age, weight, reps, duration, avgScore, pauseTime) {
        let score = 0;
        duration = duration > 0 ? duration : 1;
        const repRate = (reps / duration) * 60;

        if (repRate > 30) score += 2;
        else if (repRate >= 20) score += 1;

        if (avgScore > 0.8) score += 2;
        else if (avgScore >= 0.6) score += 1;

        if (pauseTime < 5) score += 2;
        else if (pauseTime < 10) score += 1;

        if (age < 25) score += 2;
        else if (age <= 35) score += 1;

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

    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        poseInstance.current = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        poseInstance.current.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        let stage = null;
        let timerStarted = false;

        poseInstance.current.onResults((results) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.image) ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

            if (results.poseLandmarks) {
                const lm = results.poseLandmarks;
                drawingUtils.drawConnectors(ctx, lm, POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 2 });
                drawingUtils.drawLandmarks(ctx, lm, { color: "#FF0000", lineWidth: 1 });

                const shoulder = lm[11];
                const elbow = lm[13];
                const wrist = lm[15];

                if (shoulder && elbow && wrist) {
                    if (!timerStarted) {
                        timerStarted = true;
                        startTimeRef.current = Date.now();
                    }

                    const angle = calculateAngle(shoulder, elbow, wrist);
                    if (angle < downAngleThreshold && stage !== "down") {
                        stage = "down";
                    }
                    if (angle > upAngleThreshold && stage === "down") {
                        stage = "up";
                        repCountRef.current++;
                        setReps(repCountRef.current);
                    }
                }

                const score = lm.reduce((sum, l) => sum + l.visibility, 0) / lm.length;
                poseScoresRef.current.push(score);

                if (pauseStartRef.current && (shoulder && elbow && wrist)) {
                    const pauseDuration = (Date.now() - pauseStartRef.current) / 1000;
                    setPauseTime(prev => prev + pauseDuration);
                    pauseStartRef.current = null;
                }

                setStatus(`Reps: ${repCountRef.current} | Time: ${Math.floor((Date.now() - startTimeRef.current) / 1000)}s`);
            }
        });

        return () => {
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
            if (!video.paused && !video.ended) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    const startWebcam = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        processFrameLoop();
    };

    const handleVideoUpload = (e) => {
        poseScoresRef.current = [];
        setPauseTime(0);
        repCountRef.current = 0;

        const file = e.target.files[0];
        if (!file) return;

        const video = videoRef.current;
        video.src = URL.createObjectURL(file);
        video.onloadeddata = () => {
            video.play();
            processFrameLoop();
        };

        video.onended = () => {
            const totalTime = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
            const scores = poseScoresRef.current;
            const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            const user = { name: "Akshat", age: 22, gender: "Male", weight: 70 };

            const summaryData = {
                ...user,
                duration_sec: totalTime.toFixed(1),
                reps: repCountRef.current,
                avg_pose_score: avgScore.toFixed(2),
                pause_time: pauseTime.toFixed(1),
                stamina: evaluateStamina(user.age, user.weight, repCountRef.current, totalTime, avgScore, pauseTime),
                calories: calculateCaloriesDynamic(repCountRef.current, totalTime, user.weight, user.age, user.gender, "pushups")
            };
            setSummary(summaryData);
        };
    };

    return (
        <div style={{ textAlign: "center", background: "#111", color: "white", minHeight: "100vh", paddingTop: "20px" }}>
            <h2>Push-Up Tracker</h2>
            <p>{status}</p>
            <div>
                <button onClick={startWebcam}>📷 Start Webcam</button>
                <input type="file" accept="video/*" onChange={handleVideoUpload} style={{ marginLeft: 10 }} />
            </div>
            <video ref={videoRef} width={640} height={480} style={{ display: "none" }} playsInline muted />
            <canvas ref={canvasRef} width={640} height={480} style={{ marginTop: 20, border: "2px solid #444" }} />
            {summary && (
                <div style={{ marginTop: 20, background: "#222", padding: 20, borderRadius: 8 }}>
                    <h3>Workout Summary</h3>
                    <p>Name: {summary.name}</p>
                    <p>Age: {summary.age}  Gender: {summary.gender}</p>
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
