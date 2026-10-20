import React, { useState } from "react";
import type { QuizQuestion } from "../../content/types";

/** 복습 퀴즈. 오답이어도 정답과 설명을 보여주고 다음 문제로 넘어갈 수 있다. */
export const QuizCard: React.FC<{
  questions: QuizQuestion[];
  /** 마지막 문제까지 풀었을 때 (학습 기록 저장용) */
  onFinish?: (correct: number, total: number) => void;
}> = ({ questions, onFinish }) => {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  if (questions.length === 0) return null;

  if (done) {
    return (
      <div className="quiz card">
        <div className="quiz-result">
          <span className="quiz-emoji">{correct === questions.length ? "🏆" : "🌱"}</span>
          <h4>
            {questions.length}문제 중 <b>{correct}문제</b> 정답!
          </h4>
          <p>틀린 표현은 ‘나의 학습 &gt; 복습 추천’에서 다시 볼 수 있어요.</p>
          <button
            className="btn btn-soft"
            onClick={() => {
              setIndex(0);
              setPicked(null);
              setCorrect(0);
              setDone(false);
            }}
          >
            다시 풀기
          </button>
        </div>
      </div>
    );
  }

  const q = questions[index];
  const answered = picked !== null;
  const isLast = index === questions.length - 1;

  return (
    <div className="quiz card">
      <div className="quiz-head">
        <span className="pill pill-sky">
          Q{index + 1} / {questions.length}
        </span>
        <div className="quiz-progress">
          {questions.map((qq, i) => (
            <span key={qq.id} className={i <= index ? "on" : ""} />
          ))}
        </div>
      </div>
      <h4 className="quiz-q">{q.question}</h4>
      <div className="quiz-options">
        {q.options.map((opt, i) => {
          let state = "";
          if (answered) {
            if (i === q.answer) state = "correct";
            else if (i === picked) state = "wrong";
            else state = "dim";
          }
          return (
            <button
              key={opt}
              className={`quiz-option ${state}`}
              disabled={answered}
              onClick={() => {
                setPicked(i);
                if (i === q.answer) setCorrect((c) => c + 1);
              }}
            >
              <span className="num">{i + 1}</span>
              {opt}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className={`quiz-feedback ${picked === q.answer ? "ok" : "no"}`}>
          <b>{picked === q.answer ? "정답이에요! 🎉" : `아쉬워요. 정답은 ${q.answer + 1}번이에요.`}</b>
          <p>{q.explanation}</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (isLast) {
                setDone(true);
                onFinish?.(correct, questions.length);
              }
              else {
                setIndex(index + 1);
                setPicked(null);
              }
            }}
          >
            {isLast ? "결과 보기" : "다음 문제 →"}
          </button>
        </div>
      ) : null}
    </div>
  );
};
