import { QuizHistoryGroup, QuizAttempt, Quiz } from '../types';

const APP_DATA_KEY = 'toeflQuizAppUserData';
const LAST_USER_KEY = 'toeflQuizAppLastUser';

// --- User Management ---
export const getLastUser = (): string | null => {
    return localStorage.getItem(LAST_USER_KEY);
};

export const setLastUser = (userId: string | null) => {
    if (userId) {
        localStorage.setItem(LAST_USER_KEY, userId);
    } else {
        localStorage.removeItem(LAST_USER_KEY);
    }
};

// --- Private Helper Functions ---
const getAllUserData = (): { [userId: string]: QuizHistoryGroup[] } => {
    try {
        const data = localStorage.getItem(APP_DATA_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error("Failed to parse user data from localStorage", error);
        localStorage.removeItem(APP_DATA_KEY);
        return {};
    }
};

const saveAllUserData = (data: { [userId: string]: QuizHistoryGroup[] }) => {
    localStorage.setItem(APP_DATA_KEY, JSON.stringify(data));
};


// --- Public History API ---
export const getHistory = (userId: string): QuizHistoryGroup[] => {
    const allData = getAllUserData();
    const userHistory = allData[userId] || [];
    return userHistory.sort((a, b) => b.lastAttemptTimestamp - a.lastAttemptTimestamp);
};

export const saveQuizAttempt = (
    userId: string,
    newAttemptData: {
        article: string;
        quiz: Quiz;
        userAnswers: (number[] | null)[];
        score: number;
        historyGroupId: string | null;
    }
): QuizHistoryGroup[] => {
    const allData = getAllUserData();
    const userHistory = allData[userId] || [];
    const { article, quiz, userAnswers, score, historyGroupId } = newAttemptData;

    const attempt: QuizAttempt = {
        id: `${Date.now()}`,
        userAnswers,
        score,
        timestamp: Date.now()
    };

    const existingGroup = historyGroupId ? userHistory.find(g => g.id === historyGroupId) : null;

    if (existingGroup) {
        // It's a retake: add a new attempt to the existing group
        existingGroup.attempts.push(attempt);
        existingGroup.lastAttemptTimestamp = attempt.timestamp; // Update timestamp for sorting
    } else {
        // It's a brand new quiz: create a new group
        const newGroup: QuizHistoryGroup = {
            id: `${Date.now()}-group`, // Unique ID for the new group
            article,
            quiz,
            title: quiz.title,
            attempts: [attempt],
            lastAttemptTimestamp: attempt.timestamp
        };
        userHistory.push(newGroup);
    }
    
    allData[userId] = userHistory;
    saveAllUserData(allData);
    return getHistory(userId);
};

export const deleteHistoryGroup = (userId: string, groupId: string): QuizHistoryGroup[] => {
    const allData = getAllUserData();
    const userHistory = allData[userId] || [];
    const newHistory = userHistory.filter(group => group.id !== groupId);
    
    allData[userId] = newHistory;
    saveAllUserData(allData);
    return newHistory;
};
