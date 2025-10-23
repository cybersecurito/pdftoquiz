import React, { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";

interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
}

type AppState = "upload" | "generating" | "quiz" | "results";
type AnswerStatus = "unanswered" | "correct" | "incorrect";

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerStatus, setAnswerStatus] = useState<AnswerStatus>("unanswered");
  const [score, setScore] = useState<number>(0);

  const fileToBase64 = (file: File): Promise<{mimeType: string, data: string}> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          return reject(new Error('Failed to read file as base64 string.'));
        }
        const base64String = reader.result.split(',')[1];
        resolve({ mimeType: file.type, data: base64String });
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleGenerateQuiz = async () => {
    if (!file) {
      setError("Please select a PDF file first.");
      return;
    }

    setError(null);
    setAppState("generating");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const { mimeType, data } = await fileToBase64(file);

      const pdfPart = {
        inlineData: {
          mimeType,
          data,
        },
      };

      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: {
              type: Type.STRING,
              description: "The text of the multiple-choice question.",
            },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "An array of 2 to 5 possible answers.",
            },
            answer: {
              type: Type.STRING,
              description: "The correct answer, which must be one of the strings in the options array.",
            },
          },
          required: ["question", "options", "answer"],
        },
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            pdfPart,
            { text: "Analyze this PDF document. Extract all multiple-choice questions, their options, and the correct answer for each. Return the data as a JSON array matching the provided schema. Ensure the 'answer' value exactly matches one of the 'options'. If the PDF does not contain recognizable multiple-choice questions, return an empty array." },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const parsedQuiz: QuizQuestion[] = JSON.parse(response.text.trim());

      if (parsedQuiz.length === 0) {
        setError("Could not find any multiple-choice questions in the PDF. Please try another file.");
        setAppState("upload");
        setFile(null);
        return;
      }
      
      setQuiz(parsedQuiz);
      setCurrentQuestionIndex(0);
      setScore(0);
      setSelectedAnswer(null);
      setAnswerStatus("unanswered");
      setAppState("quiz");

    } catch (err) {
      console.error(err);
      setError("Failed to generate the quiz. The PDF might be unreadable or the content is not in a supported format. Please try again.");
      setAppState("upload");
    }
  };

  const handleFileSelect = (selectedFile: File | null) => {
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setError(null);
    } else {
      setFile(null);
      setError("Please select a valid PDF file.");
    }
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e);
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e);
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e);
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };
  
  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;
    
    const currentQuestion = quiz[currentQuestionIndex];
    if (selectedAnswer === currentQuestion.answer) {
      setAnswerStatus("correct");
      setScore(s => s + 1);
    } else {
      setAnswerStatus("incorrect");
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quiz.length - 1) {
      setCurrentQuestionIndex(i => i + 1);
      setSelectedAnswer(null);
      setAnswerStatus("unanswered");
    } else {
      setAppState("results");
    }
  };

  const handleRestart = () => {
    setAppState("upload");
    setFile(null);
    setQuiz([]);
  };

  const renderUpload = () => (
    <div className="container">
      <h1>MCQ PDF to Quiz Generator</h1>
      <p>Upload a PDF with multiple-choice questions and let AI create an interactive quiz for you.</p>
      
      <input 
        type="file" 
        id="file-upload" 
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files ? e.target.files[0] : null)}
      />
      <div 
        className={`upload-box ${isDragging ? 'drag-over' : ''}`}
        onClick={() => document.getElementById('file-upload')?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragEvents}
        onDrop={handleDrop}
        aria-label="PDF upload area"
      >
        <p>Drag & drop a PDF here, or click to select a file</p>
      </div>
      
      {file && <p className="file-name">{file.name}</p>}

      <button className="btn" onClick={handleGenerateQuiz} disabled={!file}>
        Generate Quiz
      </button>

      {error && <div className="error">{error}</div>}
    </div>
  );

  const renderGenerating = () => (
    <div className="container loader">
      <div className="spinner" aria-label="Loading"></div>
      <p>Generating your quiz...</p>
      <p className="subtext">This may take a moment, especially for large PDFs.</p>
    </div>
  );

  const renderQuiz = () => {
    const currentQuestion = quiz[currentQuestionIndex];
    return (
      <div className="container quiz-container">
        <p className="quiz-progress">Question {currentQuestionIndex + 1} of {quiz.length}</p>
        <h2>{currentQuestion.question}</h2>
        <div className="options-grid" role="radiogroup">
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedAnswer === option;
            let buttonClass = 'option-btn';
            if (answerStatus !== 'unanswered') {
              if (option === currentQuestion.answer) {
                buttonClass += ' correct';
              } else if (isSelected) {
                buttonClass += ' incorrect';
              }
            } else if (isSelected) {
              buttonClass += ' selected';
            }

            return (
              <button
                key={index}
                className={buttonClass}
                onClick={() => answerStatus === 'unanswered' && setSelectedAnswer(option)}
                disabled={answerStatus !== 'unanswered'}
                role="radio"
                aria-checked={isSelected}
              >
                {option}
              </button>
            );
          })}
        </div>
        
        {answerStatus === 'unanswered' ? (
          <button className="btn" onClick={handleSubmitAnswer} disabled={selectedAnswer === null}>
            Submit Answer
          </button>
        ) : (
          <button className="btn" onClick={handleNextQuestion}>
            {currentQuestionIndex < quiz.length - 1 ? "Next Question" : "Finish Quiz"}
          </button>
        )}
      </div>
    );
  };
  
  const renderResults = () => (
    <div className="container results-container">
      <h1>Quiz Complete!</h1>
      <p>You scored</p>
      <p className="score">{score} / {quiz.length}</p>
      <button className="btn" onClick={handleRestart}>
        Create Another Quiz
      </button>
    </div>
  );
  
  switch (appState) {
    case "generating":
      return renderGenerating();
    case "quiz":
      return renderQuiz();
    case "results":
      return renderResults();
    case "upload":
    default:
      return renderUpload();
  }
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}