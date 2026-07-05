// import node module libraries
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router'

const QuizTimer = props => {
    const [[hrs, mins, secs], setTime] = useState([props.hours, props.minutes, props.seconds]);
    const [redirectTo, setRedirectTo] = useState(false)
    const router = useRouter()
    const tick = () => {
        if (hrs === 0 && mins === 0 && secs === 0) {
            console.log("redirect to result")
            setRedirectTo(true)
        } else if (mins === 0 && secs === 0) {
            setTime([hrs - 1, 59, 59]);
        } else if (secs === 0) {
            setTime([hrs, mins - 1, 59]);
        } else {
            setTime([hrs, mins, secs - 1]);
        }
    };
    useEffect(() => {
        const timerId = setInterval(() => tick(), 1000);
        redirectTo ? router.push("/marketing/student/quiz-result/") : null
        return () => clearInterval(timerId);
    });
    return (
        <div>
            <span className="text-danger"><i className="fe fe-clock me-1 align-middle"></i>
                {
                    `${hrs.toString().padStart(2, '0')}:
                    ${mins.toString().padStart(2, '0')}:
                    ${secs.toString().padStart(2, '0')}`
                }
            </span>
        </div>
    )
}

export default QuizTimer