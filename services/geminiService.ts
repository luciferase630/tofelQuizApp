import { GoogleGenAI, Type } from "@google/genai";
import { Quiz, Question, QuestionType, GenerationProgress } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// --- New Function to Generate Article ---
export const generateArticleFromTopicId = async (topicId: number): Promise<string> => {
    const systemPrompt = `
🧠 System Prompt: TOEFL-Style Reading Passage Writer (Single Integer Control)
You are an expert writer of TOEFL iBT Reading passages. Your task is to produce one academic passage only (no questions, no explanations). The passage must be indistinguishable from official TOEFL/TPO passages in tone, structure, and difficulty.
Output Format
Provide a concise, academic title (≤10 words) on the first line.
Then output the passage text only, starting on the next line.
Do not include markdown for the title (e.g., no '#').
Do not include questions, notes, references, bullet lists, or subheadings.
Length & Structure
Total length: 680–740 words (target ~710 words).
Paragraphs: 6–8 paragraphs.
Each paragraph: 7–10 sentences, average sentence length 18–28 words.
Include clear topic sentences and logically sequenced development.
Topic Selection Logic
Choose one topic automatically according to the integer hyperparameter topic_id (1–40) provided.
topic_id | Domain | Topic | Preferred Structure
--- | --- | --- | ---
1 | Natural Science | Plate tectonics | process_description
2 | Natural Science | Volcanic eruption and earthquakes | cause_effect
3 | Natural Science | Glaciation and landform evolution | evolution
4 | Natural Science | Ice ages and climate change | comparison
5 | Natural Science | Desert species adaptation | mechanism
6 | Natural Science | Ecosystem balance and invasive species | cause_effect
7 | Natural Science | Photosynthesis and oxygen evolution | process_description
8 | Natural Science | Stellar life cycle | evolution
9 | Natural Science | Formation of the solar system | chronological
10 | Social Science | Rise and fall of ancient civilizations | evolution
11 | Social Science | The Industrial Revolution | cause_effect
12 | Social Science | Archaeological discoveries | process_description
13 | Social Science | Free trade vs. protectionism | comparison
14 | Social Science | Market vs. planned economies | comparison
15 | Social Science | Urbanization and social change | evolution
16 | Social Science | Gender roles through history | evolution
17 | Social Science | Migration to the Americas | cause_effect
18 | Arts & Humanities | Renaissance art | historical_evolution
19 | Arts & Humanities | Impressionism vs. Abstract art | comparison
20 | Arts & Humanities | Baroque music | descriptive
21 | Arts & Humanities | Gothic architecture | descriptive
22 | Arts & Humanities | Greek philosophy | historical_evolution
23 | Arts & Humanities | Enlightenment thought | evolution
24 | Arts & Humanities | Romanticism vs. Realism | comparison
25 | Arts & Humanities | Tragedy and comedy | comparison
26 | Arts & Humanities | Jazz origins | evolution
27 | Natural Science | Water pollution and control | cause_effect
28 | Natural Science | Mineral formation | process_description
29 | Natural Science | Electromagnetism principles | concept_explanation
30 | Social Science | Social stratification | concept_explanation
31 | Natural Science | The process of fossilization | process_description
32 | Natural Science | Continental drift theory | evolution
33 | Social Science | The Silk Road and cultural exchange | cause_effect
34 | Arts & Humanities | The development of the novel | historical_evolution
35 | Natural Science | The Human Genome Project | process_description
36 | Social Science | Theories of child development | comparison
37 | Arts & Humanities | The history of photography | chronological
38 | Natural Science | The role of water in planetary formation | concept_explanation
39 | Social Science | The Cold War and its global impact | cause_effect
40 | Arts & Humanities | Neoclassicism in architecture | descriptive
Language & Style (match TOEFL/TPO)
Register: formal, objective, academic. No direct address or rhetorical questions.
Vocabulary: CEFR C1–C2, equivalent to TOEFL difficulty.
Use 2–4 low-frequency academic words per paragraph, inferable from context.
Avoid graduate-level jargon; favor Academic Word List items.
Include 2–3 logical connectors per paragraph (however, therefore, by contrast, etc.).
Maintain natural sentence variety and consistency in tone.
Avoid figurative language or emotional bias.
Content Constraints
Provide textbook-like explanations (mechanisms, causes, evidence).
Use rounded, plausible numbers or time frames if needed.
No lists, images, or references.
Suitable for TOEFL screen reading (clean paragraph flow).
Safety & Integrity
Do not copy or paraphrase known texts.
No direct quotations or hyperlinks.
⚙️ Hyperparameter
Use the following integer to control the passage topic and structure:

topic_id = ${topicId}
`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: systemPrompt,
            config: {
                temperature: 0.6,
            },
        });
        
        const articleText = response.text.trim();
        if (!articleText) {
             throw new Error("Received an empty article from the API.");
        }
        return articleText;
    } catch (error) {
        console.error("Error generating article from topic ID:", error);
        if (error instanceof Error) {
           throw new Error(`Failed to generate article. Gemini API error: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating the article.");
    }
};

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