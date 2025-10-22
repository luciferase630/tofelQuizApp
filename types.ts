// FIX: Removed the self-import statement that was on line 1.
// A file containing type definitions should not import from itself as it causes declaration conflicts.
export enum QuestionType {
  FactualInfo = 'Factual Information',
  Vocabulary = 'Vocabulary-in-Context',
  Inference = 'Inference',
  SentenceSimplification = 'Sentence Simplification',
  InsertText = 'Insert Text',
  ProseSummary = 'Prose Summary',
  NegativeFactualInfo = 'Negative Factual Information',
}

export interface Choice {
  text: string;
  isCorrect: boolean;
}

export interface Question {
  questionNumber: number;
  questionType: QuestionType;
  questionText: string;
  highlightedText?: string;
  paragraphForInsertion?: string;
  sentenceToInsert?: string;
  choices: Choice[];
  hint: string;
  rationale: string;
  relevantArticleSnippet?: string;
}

export interface Quiz {
  title: string;
  questions: Question[];
  summaryIntroductorySentence: string;
}

export interface QuizAttempt {
  id: string; // Unique ID for this attempt
  userAnswers: (number[] | null)[];
  score: number;
  timestamp: number;
}

export interface QuizHistoryGroup {
  id: string; // Unique ID for this article/quiz group
  article: string;
  quiz: Quiz;
  title: string;
  attempts: QuizAttempt[];
  lastAttemptTimestamp: number; // For sorting history list
}

export type GenerationProgress = {
  stage: string;
  percentage: number;
};
