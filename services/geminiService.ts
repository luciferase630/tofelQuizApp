import { GoogleGenAI, Type } from "@google/genai";
import { Quiz, Question, QuestionType, GenerationProgress } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// --- Schemas ---

const quizMetadataSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A concise title for the quiz, derived from the article's main topic." },
        summaryIntroductorySentence: { type: Type.STRING, description: "The introductory sentence for the final Prose Summary question." },
    },
    required: ["title", "summaryIntroductorySentence"]
};

const questionSchema = {
    type: Type.OBJECT,
    properties: {
        questionNumber: { type: Type.INTEGER },
        questionType: {
            type: Type.STRING,
            enum: Object.values(QuestionType)
        },
        questionText: { type: Type.STRING },
        highlightedText: { type: Type.STRING, nullable: true, description: "The specific word or sentence from the article this question refers to (for Vocabulary or Sentence Simplification types)." },
        paragraphForInsertion: { type: Type.STRING, nullable: true, description: "The paragraph with [A], [B], [C], [D] markers for the Insert Text question." },
        sentenceToInsert: { type: Type.STRING, nullable: true, description: "The sentence to be inserted for the Insert Text question." },
        choices: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING },
                    isCorrect: { type: Type.BOOLEAN }
                },
                required: ["text", "isCorrect"]
            }
        },
        hint: { type: Type.STRING, description: "A subtle hint to help the user find the answer." },
        rationale: { type: Type.STRING, description: "A detailed explanation of why the correct answer is correct and others are incorrect." },
        relevantArticleSnippet: { type: Type.STRING, nullable: true, description: "A direct quote from the article that contains the answer or the strongest clues for it." }
    },
    required: ["questionNumber", "questionType", "questionText", "choices", "hint", "rationale", "relevantArticleSnippet"]
};

// --- API Helper Functions ---

const generateQuizMetadata = async (article: string): Promise<{ title: string; summaryIntroductorySentence: string; }> => {
    const prompt = `Based on the provided article, generate a concise title for a quiz and an introductory sentence for a prose summary question. The title should reflect the article's main topic. The introductory sentence should set up the main idea summary task. Your output must be a single JSON object that strictly adheres to the provided schema.

ARTICLE:
---
${article}
---
`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", 
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: quizMetadataSchema,
            temperature: 0.3,
        },
    });
    return JSON.parse(response.text.trim());
};

const generateQuestion = async (
    article: string,
    questionNumber: number,
    questionType: QuestionType
): Promise<Question> => {
    const prompt = `You are an expert TOEFL exam creator. Your task is to create a single TOEFL-style reading question based ONLY on the provided article.
- The question must be for question number: ${questionNumber}.
- The question type must be: "${questionType}".
- The question, choices, hint, and rationale must be in formal academic English, indistinguishable from official materials.
- You MUST provide a 'relevantArticleSnippet', a direct quote from the article that contains the answer or the strongest clues.
- Your output must be a single JSON object that strictly adheres to the provided schema.
- For an 'Insert Text' question, ensure 'paragraphForInsertion' contains exactly four markers: [A], [B], [C], and [D].
- For a 'Prose Summary' question, provide 6 choices, 3 of which are correct summaries of the main ideas.

ARTICLE:
---
${article}
---
`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: questionSchema,
            temperature: 0.5,
        },
    });

    const questionData = JSON.parse(response.text.trim());
    questionData.questionNumber = questionNumber; 
    return questionData;
};

// --- Main Exported Function ---

export const generateQuiz = async (
    article: string,
    onProgress: (progress: GenerationProgress) => void
): Promise<Quiz> => {
    try {
        onProgress({ stage: 'Analyzing Article & Generating Title...', percentage: 0 });
        const metadata = await generateQuizMetadata(article);
        onProgress({ stage: 'Analyzing Article & Generating Title...', percentage: 10 });

        const questionTypes: QuestionType[] = [
            QuestionType.FactualInfo, QuestionType.Vocabulary, QuestionType.Inference,
            QuestionType.FactualInfo, QuestionType.SentenceSimplification, QuestionType.NegativeFactualInfo,
            QuestionType.Vocabulary, QuestionType.Inference, QuestionType.InsertText,
            QuestionType.FactualInfo, QuestionType.Inference, QuestionType.ProseSummary,
        ];
        
        let completedCount = 0;
        const totalQuestions = questionTypes.length;
        onProgress({ stage: `Generating Question 1 of ${totalQuestions}...`, percentage: 10 });

        const questionPromises = questionTypes.map((type, index) => {
            const questionNumber = index + 1;
            return generateQuestion(article, questionNumber, type).then(question => {
                completedCount++;
                const basePercentage = 10;
                const progressRange = 80; // Questions generation will take up 80% of the bar
                const percentage = basePercentage + (completedCount / totalQuestions) * progressRange;
                onProgress({ 
                    stage: `Generating Question ${completedCount + 1} of ${totalQuestions}...`, 
                    percentage 
                });
                return question;
            });
        });

        const resolvedQuestions = await Promise.all(questionPromises);
        
        onProgress({ stage: 'Assembling Quiz...', percentage: 95 });
        const questions = resolvedQuestions.sort((a, b) => a.questionNumber - b.questionNumber);

        const quiz = {
            title: metadata.title,
            summaryIntroductorySentence: metadata.summaryIntroductorySentence,
            questions: questions
        };
        onProgress({ stage: 'Done!', percentage: 100 });

        return quiz;

    } catch (error) {
        console.error("Error generating quiz:", error);
        if (error instanceof Error) {
           throw new Error(`Failed to generate quiz from the article. Gemini API error: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating the quiz.");
    }
};
