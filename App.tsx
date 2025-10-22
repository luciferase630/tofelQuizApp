import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { generateQuiz } from './services/geminiService';
import { Quiz, Question, QuestionType, QuizHistoryGroup, QuizAttempt, GenerationProgress } from './types';
import { getHistory, saveQuizAttempt, deleteHistoryGroup, getLastUser, setLastUser } from './services/historyService';
import {
    LightbulbIcon, CheckIcon, XIcon, InfoIcon,
    ChevronLeftIcon, ChevronRightIcon, BookOpenIcon, SparklesIcon,
    TrashIcon, ClockIcon, ArrowPathIcon, UserIcon, ArrowRightOnRectangleIcon
} from './components/Icons';

type AppState = 'login' | 'input' | 'loading' | 'error' | 'quiz' | 'results' | 'analysis' | 'review' | 'select_attempt';

const App: React.FC = () => {
    // App & User State
    const [appState, setAppState] = useState<AppState>('login');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Quiz Generation & State
    const [article, setArticle] = useState<string>('');
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
    
    // Quiz Taking State
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
    const [userAnswers, setUserAnswers] = useState<(number[] | null)[]>([]);
    
    // History & Review State
    const [history, setHistory] = useState<QuizHistoryGroup[]>([]);
    const [currentQuizContext, setCurrentQuizContext] = useState<{ historyGroupId: string | null }>({ historyGroupId: null });
    const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<QuizHistoryGroup | null>(null);
    const [selectedAttempt, setSelectedAttempt] = useState<QuizAttempt | null>(null);
    const [revealedHints, setRevealedHints] = useState<boolean[]>([]);
    const [revealedRationales, setRevealedRationales] = useState<boolean[]>([]);
    
    useEffect(() => {
        const lastUser = getLastUser();
        if (lastUser) {
            handleLogin(lastUser);
        } else {
            setAppState('login');
        }
    }, []);

    const handleLogin = (userId: string) => {
        const cleanedUserId = userId.trim();
        if (cleanedUserId) {
            setCurrentUserId(cleanedUserId);
            setLastUser(cleanedUserId);
            setHistory(getHistory(cleanedUserId));
            setAppState('input');
        }
    };

    const handleLogout = () => {
        setCurrentUserId(null);
        setLastUser(null);
        setHistory([]);
        handleRestart();
        setAppState('login');
    };

    const handleGenerateQuiz = useCallback(async () => {
        if (!article.trim() || !currentUserId) return;
        setAppState('loading');
        setError(null);
        setQuiz(null);
        setCurrentQuizContext({ historyGroupId: null }); // It's a new quiz
        setGenerationProgress({ stage: 'Initializing...', percentage: 0 });
        try {
            const generatedQuiz = await generateQuiz(article, setGenerationProgress);
            setQuiz(generatedQuiz);
            setUserAnswers(new Array(generatedQuiz.questions.length).fill(null));
            setRevealedHints(new Array(generatedQuiz.questions.length).fill(false));
            setRevealedRationales(new Array(generatedQuiz.questions.length).fill(false));
            setCurrentQuestionIndex(0);
            setAppState('quiz');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            setAppState('error');
        } finally {
            setGenerationProgress(null);
        }
    }, [article, currentUserId]);

    const handleRestart = () => {
        setArticle('');
        setQuiz(null);
        setUserAnswers([]);
        setRevealedHints([]);
        setRevealedRationales([]);
        setCurrentQuestionIndex(0);
        setError(null);
        setSelectedHistoryGroup(null);
        setSelectedAttempt(null);
        setCurrentQuizContext({ historyGroupId: null });
        setAppState('input');
    };

    const score = useMemo(() => {
        if (!quiz) return 0;
        return quiz.questions.reduce((acc, question, index) => {
            const userAnswerIndices = userAnswers[index];
            if (!userAnswerIndices) return acc;
            const correctChoiceIndices = question.choices.map((c, i) => c.isCorrect ? i : -1).filter(i => i !== -1);
            if (correctChoiceIndices.length === 0) return acc;
            const userAnswerSet = new Set(userAnswerIndices);
            const correctChoicesSet = new Set(correctChoiceIndices);
            if (userAnswerSet.size === correctChoicesSet.size && [...userAnswerSet].every(val => correctChoicesSet.has(val))) {
                return acc + 1;
            }
            return acc;
        }, 0);
    }, [quiz, userAnswers]);

    const handleFinishQuiz = useCallback(() => {
        if (!quiz || !currentUserId) return;
        const updatedHistory = saveQuizAttempt(currentUserId, {
            article,
            quiz,
            userAnswers,
            score,
            historyGroupId: currentQuizContext.historyGroupId
        });
        setHistory(updatedHistory);
        setAppState('results');
    }, [quiz, article, userAnswers, score, currentUserId, currentQuizContext]);
    
    const handleReviewFromHistory = (group: QuizHistoryGroup) => {
        setSelectedHistoryGroup(group);
        setAppState('select_attempt');
    };

    const handleSelectAttemptForReview = (attempt: QuizAttempt) => {
        if (!selectedHistoryGroup) return;
        setArticle(selectedHistoryGroup.article);
        setQuiz(selectedHistoryGroup.quiz);
        setSelectedAttempt(attempt);
        setUserAnswers(attempt.userAnswers);
        setCurrentQuestionIndex(selectedHistoryGroup.quiz.questions.length - 1);
        setAppState('results');
    };

    const handleRetakeFromHistory = (group: QuizHistoryGroup) => {
        setArticle(group.article);
        setQuiz(group.quiz);
        setUserAnswers(new Array(group.quiz.questions.length).fill(null));
        setRevealedHints(new Array(group.quiz.questions.length).fill(false));
        setRevealedRationales(new Array(group.quiz.questions.length).fill(false));
        setCurrentQuestionIndex(0);
        setCurrentQuizContext({ historyGroupId: group.id }); // Link this session to the history group
        setAppState('quiz');
    };

    const handleDeleteFromHistory = (groupId: string) => {
        if (!currentUserId) return;
        const updatedHistory = deleteHistoryGroup(currentUserId, groupId);
        setHistory(updatedHistory);
    };

    const renderContent = () => {
        switch (appState) {
            case 'login':
                return <LoginScreen onLogin={handleLogin} />;
            case 'loading':
                return <LoadingScreen progress={generationProgress} />;
            case 'error':
                return <ErrorScreen error={error} onTryAgain={() => setAppState('input')} />;
            case 'select_attempt':
                return <AttemptSelectionScreen group={selectedHistoryGroup!} onSelect={handleSelectAttemptForReview} onBack={handleRestart} />;
            case 'results':
                return (
                    <ResultsScreen
                        score={selectedAttempt ? selectedAttempt.score : score}
                        totalQuestions={quiz?.questions.length || 0}
                        quizTitle={quiz?.title || ''}
                        onRestart={handleRestart}
                        onReview={() => setAppState('review')}
                        onAnalyze={() => setAppState('analysis')}
                    />
                );
            case 'analysis':
                 return (
                    <AnalysisReportScreen
                        quiz={quiz!}
                        userAnswers={userAnswers}
                        onBackToResults={() => setAppState('results')}
                    />
                );
            case 'quiz':
            case 'review':
                if (quiz) {
                     return (
                        <QuizScreen
                            article={article}
                            quiz={quiz}
                            currentQuestionIndex={currentQuestionIndex}
                            setCurrentQuestionIndex={setCurrentQuestionIndex}
                            userAnswers={userAnswers}
                            setUserAnswers={setUserAnswers}
                            revealedHints={revealedHints}
                            setRevealedHints={setRevealedHints}
                            revealedRationales={revealedRationales}
                            setRevealedRationales={setRevealedRationales}
                            onSubmit={handleFinishQuiz}
                            reviewMode={appState === 'review'}
                            onBackToResults={() => {
                                setSelectedAttempt(null); // Clear selected attempt when going back
                                setAppState('results');
                            }}
                        />
                    );
                }
                setAppState('input');
                return null;
             case 'input':
             default:
                return (
                    <ArticleInputScreen
                        article={article}
                        setArticle={setArticle}
                        onGenerate={handleGenerateQuiz}
                        history={history}
                        onReview={handleReviewFromHistory}
                        onRetake={handleRetakeFromHistory}
                        onDelete={handleDeleteFromHistory}
                        userId={currentUserId}
                        onLogout={handleLogout}
                    />
                );
        }
    };

    return <div className="min-h-screen font-sans">{renderContent()}</div>;
};

// --- Child Components ---

const LoginScreen: React.FC<{ onLogin: (userId: string) => void }> = ({ onLogin }) => {
    const [id, setId] = useState('');
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4">
            <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl text-center">
                <UserIcon className="w-16 h-16 mx-auto text-blue-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Welcome!</h1>
                <p className="text-gray-600 mb-6">Please enter a User ID to save and track your progress.</p>
                <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="Enter your User ID"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && onLogin(id)}
                />
                <button
                    onClick={() => onLogin(id)}
                    disabled={!id.trim()}
                    className="mt-4 w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                    Login / Create ID
                </button>
            </div>
        </div>
    );
};

const LoadingScreen: React.FC<{ progress: GenerationProgress | null }> = ({ progress }) => (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4">
        <div className="w-full max-w-md text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Crafting Your Quiz...</h2>
            <div className="w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden">
                <div
                    className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-linear"
                    style={{ width: `${progress?.percentage || 0}%` }}
                ></div>
            </div>
            <p className="text-lg text-gray-600">{progress?.stage || 'Initializing...'}</p>
        </div>
    </div>
);

const ErrorScreen: React.FC<{ error: string | null; onTryAgain: () => void }> = ({ error, onTryAgain }) => (
    <div className="flex flex-col items-center justify-center h-screen bg-red-50 text-red-700 p-4">
        <h2 className="text-2xl font-bold mb-4">An Error Occurred</h2>
        <p className="text-center mb-6">{error}</p>
        <button onClick={onTryAgain} className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Try Again
        </button>
    </div>
);

const AttemptSelectionScreen: React.FC<{ group: QuizHistoryGroup; onSelect: (attempt: QuizAttempt) => void; onBack: () => void; }> = ({ group, onSelect, onBack }) => (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 truncate pr-4">Review Attempts for "{group.title}"</h1>
                <button onClick={onBack} className="px-6 py-2 bg-white text-blue-600 border border-gray-300 rounded-full font-semibold hover:bg-gray-100 transition-colors flex-shrink-0">
                    Back to Home
                </button>
            </div>
            <div className="space-y-4">
                {group.attempts.sort((a,b) => b.timestamp - a.timestamp).map((attempt, index) => (
                    <div key={attempt.id} className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-gray-800">Attempt {group.attempts.length - index}</h3>
                            <p className="text-sm text-gray-500 mt-1">{new Date(attempt.timestamp).toLocaleString()}</p>
                            <p className="text-md text-gray-700 font-semibold mt-2">Score: {attempt.score} / {group.quiz.questions.length}</p>
                        </div>
                        <button onClick={() => onSelect(attempt)} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                            View Details
                        </button>
                    </div>
                ))}
            </div>
        </div>
    </div>
);


interface ArticleInputScreenProps {
    article: string;
    setArticle: (article: string) => void;
    onGenerate: () => void;
    history: QuizHistoryGroup[];
    onReview: (group: QuizHistoryGroup) => void;
    onRetake: (group: QuizHistoryGroup) => void;
    onDelete: (id: string) => void;
    userId: string | null;
    onLogout: () => void;
}

const ArticleInputScreen: React.FC<ArticleInputScreenProps> = ({ article, setArticle, onGenerate, history, onReview, onRetake, onDelete, userId, onLogout }) => (
     <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-100 flex flex-col items-center p-4 sm:p-8">
        <div className="w-full max-w-6xl">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                     <UserIcon className="w-8 h-8 text-gray-600"/>
                     <span className="text-xl font-semibold text-gray-700">{userId}</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-gray-800 hidden lg:block">TOEFL Quiz Generator</h1>
                <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg shadow hover:bg-gray-100 transition-colors">
                    <ArrowRightOnRectangleIcon className="w-5 h-5"/>
                    <span>Logout</span>
                </button>
            </div>
        </div>
        
        <div className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
            <div className="lg:w-2/3 bg-white rounded-2xl shadow-xl p-8">
                 <h2 className="text-2xl font-bold text-gray-700 mb-4">Generate a New Quiz</h2>
                <textarea
                    value={article}
                    onChange={(e) => setArticle(e.target.value)}
                    placeholder="Paste your article here..."
                    className="w-full h-80 p-4 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200"
                />
                <button
                    onClick={onGenerate}
                    disabled={!article.trim()}
                    className="mt-6 w-full flex items-center justify-center px-6 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:scale-100 disabled:cursor-not-allowed"
                >
                    <BookOpenIcon className="w-6 h-6 mr-3" />
                    Generate Quiz
                </button>
            </div>

            <div className="lg:w-1/3">
                 <h2 className="text-2xl font-bold text-gray-700 mb-4 text-center lg:text-left">Quiz History</h2>
                 {history.length === 0 ? (
                     <div className="text-center bg-white/60 p-8 rounded-lg border-2 border-dashed border-gray-300">
                        <p className="text-gray-500">Your completed quizzes will appear here.</p>
                     </div>
                 ) : (
                    <div className="space-y-4 max-h-[55vh] lg:max-h-[60vh] overflow-y-auto pr-2">
                        {history.map(group => (
                             <HistoryCard key={group.id} group={group} onReview={onReview} onRetake={onRetake} onDelete={onDelete} />
                        ))}
                    </div>
                 )}
            </div>
        </div>
    </div>
);

interface HistoryCardProps {
    group: QuizHistoryGroup;
    onReview: (group: QuizHistoryGroup) => void;
    onRetake: (group: QuizHistoryGroup) => void;
    onDelete: (id: string) => void;
}
const HistoryCard: React.FC<HistoryCardProps> = ({ group, onReview, onRetake, onDelete }) => {
    const latestAttempt = group.attempts.sort((a,b) => b.timestamp - a.timestamp)[0];
    const bestScore = Math.max(...group.attempts.map(a => a.score));

    return (
        <div className="bg-white p-4 rounded-lg shadow-md transition-shadow hover:shadow-lg">
            <div className="flex justify-between items-start">
                <div className="flex-grow">
                     <h3 className="font-bold text-gray-800 truncate pr-2">{group.title}</h3>
                     <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                        <ClockIcon className="w-4 h-4" />
                        Last attempt: {new Date(latestAttempt.timestamp).toLocaleDateString()}
                    </p>
                    <div className="text-sm text-gray-600 my-2 font-semibold flex gap-4">
                        <span>Attempts: {group.attempts.length}</span>
                        <span>Best Score: {bestScore} / {group.quiz.questions.length}</span>
                    </div>
                </div>
                 <button onClick={() => onDelete(group.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-100 rounded-full flex-shrink-0">
                    <TrashIcon className="w-5 h-5"/>
                </button>
            </div>
            <div className="flex gap-2 mt-3">
                 <button onClick={() => onReview(group)} className="flex-1 px-4 py-2 text-sm font-semibold bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors flex items-center justify-center gap-2">
                    <BookOpenIcon className="w-4 h-4"/> Review
                </button>
                 <button onClick={() => onRetake(group)} className="flex-1 px-4 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                    <ArrowPathIcon className="w-4 h-4"/> Retake
                </button>
            </div>
        </div>
    );
};


interface ResultsScreenProps {
    score: number;
    totalQuestions: number;
    quizTitle: string;
    onRestart: () => void;
    onReview: () => void;
    onAnalyze: () => void;
}
const ResultsScreen: React.FC<ResultsScreenProps> = ({ score, totalQuestions, quizTitle, onRestart, onReview, onAnalyze }) => {
    const accuracy = totalQuestions > 0 ? ((score / totalQuestions) * 100).toFixed(0) : 0;
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 sm:p-6 md:p-8">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 text-center">
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Quiz Completed!</h2>
                <p className="text-gray-600 mb-6">Results for "{quizTitle}".</p>
                <div className="mb-8">
                    <p className="text-xl text-gray-700">Your Score:</p>
                    <p className="text-6xl font-bold text-blue-600 my-2">{score} <span className="text-4xl text-gray-500">/ {totalQuestions}</span></p>
                    <p className="text-2xl font-semibold text-gray-600">Accuracy: {accuracy}%</p>
                </div>
                <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                    <button
                        onClick={onRestart}
                        className="px-8 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-full font-semibold hover:bg-blue-50 transition-all duration-300 ease-in-out transform hover:scale-105"
                    >
                        New Article
                    </button>
                    <button
                        onClick={onReview}
                        className="px-8 py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg"
                    >
                        Review Answers
                    </button>
                     <button
                        onClick={onAnalyze}
                        className="px-8 py-3 bg-teal-600 text-white rounded-full font-semibold hover:bg-teal-700 transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg"
                    >
                        Analysis Report
                    </button>
                </div>
            </div>
        </div>
    );
};

interface AnalysisReportScreenProps {
    quiz: Quiz;
    userAnswers: (number[] | null)[];
    onBackToResults: () => void;
}
const AnalysisReportScreen: React.FC<AnalysisReportScreenProps> = ({ quiz, userAnswers, onBackToResults }) => {
    const incorrectAnswers = quiz.questions.map((q, i) => {
        const userAnswerIndices = userAnswers[i];
        const correctChoiceIndices = q.choices.map((c, j) => c.isCorrect ? j : -1).filter(j => j !== -1);
        const isCorrect = userAnswerIndices !== null &&
                          new Set(userAnswerIndices).size === new Set(correctChoiceIndices).size &&
                          [...userAnswerIndices].every(val => correctChoiceIndices.includes(val));
        return { question: q, index: i, isCorrect };
    }).filter(item => !item.isCorrect);

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                     <h1 className="text-3xl font-bold text-gray-800">Analysis Report</h1>
                     <button
                        onClick={onBackToResults}
                        className="px-6 py-2 bg-white text-blue-600 border border-gray-300 rounded-full font-semibold hover:bg-gray-100 transition-colors"
                    >
                        Back to Results
                    </button>
                </div>

                {incorrectAnswers.length === 0 ? (
                     <div className="text-center bg-white p-10 rounded-lg shadow">
                         <h2 className="text-2xl font-bold text-green-600">Congratulations!</h2>
                         <p className="mt-2 text-gray-700">You answered all questions correctly. Great job!</p>
                     </div>
                ) : (
                    <div className="space-y-6">
                        {incorrectAnswers.map(({ question, index }) => {
                            const userAnswerIndices = userAnswers[index] || [];
                            const correctChoices = question.choices.filter(c => c.isCorrect);
                            const userChoices = userAnswerIndices.map(i => question.choices[i]);
                            return (
                                <div key={index} className="bg-white p-6 rounded-lg shadow-md border-l-4 border-red-500">
                                    <h3 className="text-lg font-bold text-gray-800">Question {question.questionNumber}: {question.questionType}</h3>
                                    <p className="mt-2 text-gray-700">{question.questionText}</p>
                                    
                                    <div className="mt-4 p-3 bg-red-50 rounded-md">
                                        <p className="font-semibold text-red-800">Your Answer:</p>
                                        {userChoices.length > 0 ? userChoices.map((c, i) => <p key={i} className="text-red-700 ml-4">&bull; {c.text}</p>) : <p className="text-gray-500 ml-4 italic">No answer provided.</p>}
                                    </div>
                                    <div className="mt-2 p-3 bg-green-50 rounded-md">
                                        <p className="font-semibold text-green-800">Correct Answer:</p>
                                        {correctChoices.map((c, i) => <p key={i} className="text-green-700 ml-4">&bull; {c.text}</p>)}
                                    </div>
                                    <div className="mt-4">
                                        <p className="font-semibold text-gray-700">Rationale:</p>
                                        <p className="text-gray-600">{question.rationale}</p>
                                    </div>
                                    {question.relevantArticleSnippet && (
                                    <div className="mt-4 pt-4 border-t">
                                        <p className="font-semibold text-gray-700">Relevant Text from Article:</p>
                                        <blockquote className="mt-2 p-3 bg-gray-100 border-l-4 border-gray-400 text-gray-600 italic">
                                            "{question.relevantArticleSnippet}"
                                        </blockquote>
                                    </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

interface QuizScreenProps {
    article: string;
    quiz: Quiz;
    currentQuestionIndex: number;
    setCurrentQuestionIndex: React.Dispatch<React.SetStateAction<number>>;
    userAnswers: (number[] | null)[];
    setUserAnswers: React.Dispatch<React.SetStateAction<(number[] | null)[]>>;
    revealedHints: boolean[];
    setRevealedHints: React.Dispatch<React.SetStateAction<boolean[]>>;
    revealedRationales: boolean[];
    setRevealedRationales: React.Dispatch<React.SetStateAction<boolean[]>>;
    onSubmit: () => void;
    reviewMode: boolean;
    onBackToResults: () => void;
}

const QuizScreen: React.FC<QuizScreenProps> = (props) => {
    const {
        article, quiz, currentQuestionIndex, setCurrentQuestionIndex,
        userAnswers, setUserAnswers, revealedHints, setRevealedHints,
        revealedRationales, setRevealedRationales, onSubmit, reviewMode, onBackToResults
    } = props;

    const [showArticle, setShowArticle] = useState(false);

    const question = quiz.questions[currentQuestionIndex];
    const userAnswer = userAnswers[currentQuestionIndex];

    const handleAnswerSelect = (choiceIndex: number) => {
        if (reviewMode) return;

        const newAnswers = [...userAnswers];
        if (question.questionType === QuestionType.ProseSummary) {
            const currentSelection = (newAnswers[currentQuestionIndex] || []).slice();
            const choicePos = currentSelection.indexOf(choiceIndex);
            if (choicePos > -1) {
                currentSelection.splice(choicePos, 1);
            } else if (currentSelection.length < 3) {
                currentSelection.push(choiceIndex);
            }
            newAnswers[currentQuestionIndex] = currentSelection.sort((a, b) => a - b);
        } else {
            newAnswers[currentQuestionIndex] = [choiceIndex];
        }
        setUserAnswers(newAnswers);
    };

    const handleNext = () => {
        if (currentQuestionIndex < quiz.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            if (reviewMode) {
                onBackToResults();
            } else {
                onSubmit();
            }
        }
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const renderInsertTextParagraph = (paragraph: string) => {
        const parts = paragraph.split(/(\[A\]|\[B\]|\[C\]|\[D\])/g);
        const map: { [key: string]: number } = { '[A]': 0, '[B]': 1, '[C]': 2, '[D]': 3 };

        return (
            <p className="text-lg leading-relaxed text-gray-700">
                {parts.map((part, index) => {
                    if (map.hasOwnProperty(part)) {
                        const choiceIndex = map[part];
                        const isSelected = userAnswer?.[0] === choiceIndex;
                        const isCorrect = question.choices[choiceIndex]?.isCorrect;
                        
                        let bgColor = 'bg-gray-200 hover:bg-gray-300';
                        if (reviewMode) {
                            if (isSelected && isCorrect) bgColor = 'bg-green-500 text-white';
                            else if (isSelected && !isCorrect) bgColor = 'bg-red-500 text-white';
                            else if (!isSelected && isCorrect) bgColor = 'bg-green-500 text-white';
                            else bgColor = 'bg-gray-200';
                        } else if (isSelected) {
                             bgColor = 'bg-blue-500';
                        }
                        
                        return (
                            <span
                                key={index}
                                onClick={() => handleAnswerSelect(choiceIndex)}
                                className={`inline-block w-6 h-6 rounded mx-1 transition-colors ${reviewMode ? '' : 'cursor-pointer'} ${bgColor}`}
                            ></span>
                        );
                    }
                    return <span key={index}>{part}</span>;
                })}
            </p>
        );
    };

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-gray-100">
            <div className={`w-full md:w-1/2 p-6 md:p-8 overflow-y-auto transition-all duration-300 ${showArticle ? 'block' : 'hidden'} md:block`}>
                <div className="bg-white p-6 rounded-lg shadow-md max-h-[90vh] overflow-y-auto">
                    <button onClick={() => setShowArticle(false)} className="md:hidden mb-4 px-4 py-2 bg-gray-200 rounded">Back to Question</button>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">{quiz.title}</h2>
                    <div className="prose max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: article.replace(/\n/g, '<br />') }}></div>
                </div>
            </div>

            <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col">
                 <div className="bg-white p-6 rounded-lg shadow-md flex-grow flex flex-col">
                    <div className="mb-4">
                        <div className="flex justify-between mb-1">
                            <span className="text-base font-medium text-blue-700">Question {currentQuestionIndex + 1} of {quiz.questions.length}</span>
                            {reviewMode && <span className="text-sm font-bold text-teal-600 bg-teal-100 px-3 py-1 rounded-full">Review Mode</span>}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%` }}></div>
                        </div>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-500 mb-2">{question.questionType}</h3>

                    {question.questionType === QuestionType.InsertText && question.sentenceToInsert && (
                        <div className="my-4 p-4 bg-blue-50 border-l-4 border-blue-400">
                            <p className="font-semibold text-gray-800">Insert the following sentence:</p>
                            <p className="mt-2 text-gray-700 italic">"{question.sentenceToInsert}"</p>
                        </div>
                    )}
                    
                    <div className="prose max-w-none text-gray-800 mb-6 flex-grow">
                        {question.questionType === QuestionType.InsertText && question.paragraphForInsertion
                            ? renderInsertTextParagraph(question.paragraphForInsertion)
                            : <p className="text-lg leading-relaxed">{question.questionText}</p>
                        }
                    </div>

                    <div className="space-y-3">
                        {question.questionType !== QuestionType.InsertText && question.choices.map((choice, index) => {
                            const isSelected = userAnswer?.includes(index);
                            let baseStyle = "border-gray-300 hover:bg-gray-100";
                            let indicator = null;

                            if (reviewMode) {
                                baseStyle = "border-gray-300";
                                if (choice.isCorrect) {
                                    baseStyle = "border-green-500 bg-green-50";
                                    indicator = <CheckIcon className="w-6 h-6 text-green-600" />;
                                }
                                if (isSelected && !choice.isCorrect) {
                                    baseStyle = "border-red-500 bg-red-50";
                                    indicator = <XIcon className="w-6 h-6 text-red-600" />;
                                }
                            } else {
                                if (isSelected) {
                                    baseStyle = "border-blue-500 bg-blue-50";
                                }
                            }
                            
                            return (
                                <button
                                    key={index}
                                    onClick={() => handleAnswerSelect(index)}
                                    disabled={reviewMode}
                                    className={`w-full text-left p-4 border rounded-lg flex items-center transition-all duration-200 ${baseStyle} ${!reviewMode ? 'cursor-pointer' : 'cursor-default'}`}
                                >
                                    <div className={`w-6 h-6 mr-4 rounded-full flex-shrink-0 border-2 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}></div>
                                    <span className="flex-grow text-gray-800">{choice.text}</span>
                                    {indicator && <div className="ml-4">{indicator}</div>}
                                </button>
                            );
                        })}
                    </div>
                    
                    {reviewMode && (
                        <div className="mt-6 space-x-4">
                            <button onClick={() => setRevealedHints(p => p.map((h, i) => i === currentQuestionIndex ? !h : h))} className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 flex items-center gap-2">
                                <LightbulbIcon className="w-5 h-5"/> Hint
                            </button>
                            <button onClick={() => setRevealedRationales(p => p.map((r, i) => i === currentQuestionIndex ? !r : r))} className="px-4 py-2 text-sm font-medium text-green-600 bg-green-100 rounded-full hover:bg-green-200 flex items-center gap-2">
                                <InfoIcon className="w-5 h-5" /> Rationale
                            </button>
                        </div>
                    )}

                    {revealedHints[currentQuestionIndex] && (
                        <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 rounded-r-lg">
                            <strong>Hint:</strong> {question.hint}
                        </div>
                    )}
                    {revealedRationales[currentQuestionIndex] && (
                        <div className="mt-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-800 rounded-r-lg">
                             <strong>Rationale:</strong> {question.rationale}
                        </div>
                    )}

                    <div className="mt-8 pt-4 border-t flex justify-between items-center">
                        <button onClick={handlePrev} disabled={currentQuestionIndex === 0} className="px-4 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
                            <ChevronLeftIcon className="w-5 h-5 mr-1" /> Previous
                        </button>
                        <button onClick={() => setShowArticle(true)} className="md:hidden px-4 py-2 bg-blue-500 text-white rounded-lg">View Article</button>
                        <button onClick={handleNext} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center">
                            {currentQuestionIndex === quiz.questions.length - 1 ? (reviewMode ? 'Back to Results' : 'Finish Quiz') : 'Next'}
                            <ChevronRightIcon className="w-5 h-5 ml-1" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
