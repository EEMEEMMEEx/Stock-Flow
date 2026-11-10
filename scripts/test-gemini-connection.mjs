import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

const key = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
console.log('Testing with key prefix:', key.slice(0, 10), 'length:', key.length);

const ai = new GoogleGenAI({ apiKey: key });
console.log('GoogleGenAI instance created. Calling API...');

try {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.log('Timeout reached (10s)');
    controller.abort();
  }, 10000);

  const res = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: 'test'
  });
  clearTimeout(timer);
  console.log('SUCCESS! Model answered:', res.text?.trim());
} catch (err) {
  console.log('ERROR CAUGHT:', err.message || err);
}
