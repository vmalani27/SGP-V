'use client';

import { useState, useCallback } from 'react';
import type { QuizQuestion, QuizConfig, QuizAnswerState, QuizResult } from '@/lib/content-types';

function QuestionCard({
  question,
  index,
  answer,
  onAnswer,
  result,
}: {
  question: QuizQuestion;
  index: number;
  answer: string;
  onAnswer: (questionId: string, value: string) => void;
  result?: { correct: boolean; explanation?: string };
}) {
  return (
    <div className={`rounded-xl border p-5 transition ${
      result
        ? result.correct
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-red-500/30 bg-red-500/5'
        : 'border-line bg-panel'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          result
            ? result.correct
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
            : 'bg-line/20 text-muted'
        }`}>
          {result ? (
            result.correct ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            )
          ) : (
            index + 1
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              question.type === 'multiple_choice'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : question.type === 'true_false'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              {question.type === 'multiple_choice' ? 'Choice' : question.type === 'true_false' ? 'True/False' : 'Fill Blank'}
            </span>
          </div>
          <p className="text-sm text-text font-medium leading-relaxed mb-3">{question.question}</p>

          {question.type === 'multiple_choice' && question.options && (
            <div className="space-y-2">
              {question.options.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-sm cursor-pointer transition ${
                    answer === opt.value
                      ? 'border-accent/40 bg-accent/5 text-text'
                      : 'border-line bg-bg/50 text-muted hover:border-line/80 hover:text-text'
                  } ${result ? 'pointer-events-none' : ''}`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={opt.value}
                    checked={answer === opt.value}
                    onChange={() => onAnswer(question.id, opt.value)}
                    disabled={!!result}
                    className="h-4 w-4 accent-accent"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === 'true_false' && (
            <div className="flex gap-3">
              {['true', 'false'].map((val) => (
                <label
                  key={val}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-3 text-sm cursor-pointer transition capitalize ${
                    answer === val
                      ? 'border-accent/40 bg-accent/5 text-text'
                      : 'border-line bg-bg/50 text-muted hover:border-line/80 hover:text-text'
                  } ${result ? 'pointer-events-none' : ''}`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={val}
                    checked={answer === val}
                    onChange={() => onAnswer(question.id, val)}
                    disabled={!!result}
                    className="h-4 w-4 accent-accent"
                  />
                  <span>{val}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === 'fill_blank' && (
            <input
              type="text"
              value={answer}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              disabled={!!result}
              placeholder="Type your answer..."
              className="w-full rounded-lg border border-line bg-bg/50 px-4 py-2.5 text-sm text-text placeholder:text-muted/40 focus:border-accent/40 focus:outline-none disabled:opacity-60"
            />
          )}

          {result && result.explanation && (
            <div className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${
              result.correct
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : 'border-red-500/20 bg-red-500/5 text-red-300'
            }`}>
              {result.explanation}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuizSection({
  courseId,
  chapterId,
  quiz,
  onChapterComplete,
}: {
  courseId: string;
  chapterId: string;
  quiz: QuizConfig;
  onChapterComplete: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { correct: boolean; explanation?: string }>>({});
  const [submitted, setSubmitted] = useState(false);

  const totalQuestions = quiz.questions.length;
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(results).filter((r) => r.correct).length;

  const handleAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const newResults: Record<string, { correct: boolean; explanation?: string }> = {};

    for (const q of quiz.questions) {
      const userAnswer = (answers[q.id] || '').trim().toLowerCase();
      const correct = userAnswer === q.correct_answer.trim().toLowerCase();
      newResults[q.id] = { correct, explanation: q.explanation };
    }

    setResults(newResults);
    setSubmitted(true);

    const passed = Object.values(newResults).filter((r) => r.correct).length >= quiz.passing_score;
    if (passed) {
      onChapterComplete();
    }
  }, [answers, quiz, onChapterComplete]);

  const score = submitted ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = submitted && correctCount >= quiz.passing_score;

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text">Knowledge Check</h3>
          <span className="text-xs text-muted">{totalQuestions} questions</span>
        </div>
        {submitted && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              {correctCount}/{totalQuestions} correct
            </span>
            <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${
              passed
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              {score}% {passed ? 'Passed' : 'Try Again'}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4 p-6">
        {quiz.questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={idx}
            answer={answers[q.id] || ''}
            onAnswer={submitted ? () => {} : handleAnswer}
            result={results[q.id]}
          />
        ))}
      </div>

      <div className="border-t border-line px-6 py-4">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={answeredCount < totalQuestions}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit Quiz ({answeredCount}/{totalQuestions} answered)
          </button>
        ) : !passed ? (
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setResults({});
                setSubmitted(false);
              }}
              className="rounded-lg border border-line px-6 py-2.5 text-sm font-medium text-text transition hover:bg-panel"
            >
              Retry Quiz
            </button>
            <span className="text-xs text-muted">
              You need {quiz.passing_score} correct answers to pass.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="text-sm text-emerald-400 font-medium">
              Chapter complete! Well done.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
