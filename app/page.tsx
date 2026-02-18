"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Editor, { OnMount } from '@monaco-editor/react';
import JsonToTS from 'json-to-ts';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';

// --- TYPES ---
interface Conversion {
  id: string;
  created_at: string;
  input_text: string;
  output_text: string;
  format_type: string;
  user_id: string;
}

type MonacoEditor = Parameters<OnMount>[0];

const placeholders: Record<string, { input: string; output: string }> = {
  jsx: {
    input: `<svg width="100" height="100">\n  <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />\n</svg>`,
    output: `export const IconComponent = (props) => (\n  <svg width="100" height="100" {...props}>\n    <circle cx="50" cy="50" r="40" stroke="green" strokeWidth="4" fill="yellow" />\n  </svg>\n);`
  },
  svg_tailwind: {
    input: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000">\n  <path d="M5 12h14M12 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n</svg>`,
    output: `export const Icon = ({ className = "w-6 h-6" }) => (\n  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">\n    <path d="M5 12h14M12 5l7 7-7 7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>\n  </svg>\n);`
  },
  html_jsx: {
    input: `<div class="container" for="username">\n  <label>Username</label>\n  <input type="text" id="username" />\n</div>`,
    output: `<div className="container" htmlFor="username">\n  <label>Username</label>\n  <input type="text" id="username" />\n</div>`
  },
  tailwind: {
    input: `.btn {\n  background-color: #3b82f6;\n  padding: 0.5rem 1rem;\n  border-radius: 0.25rem;\n}`,
    output: `bg-blue-500 px-4 py-2 rounded`
  },
  css_obj: {
    input: `background-color: #ffffff;\nmargin-top: 20px;\nfont-size: 1rem;`,
    output: `{\n  backgroundColor: '#ffffff',\n  marginTop: '20px',\n  fontSize: '1rem'\n}`
  },
  typescript: {
    input: `{\n  "id": 1,\n  "name": "John Doe",\n  "isActive": true\n}`,
    output: `interface RootObject {\n  id: number;\n  name: string;\n  isActive: boolean;\n}`
  },
  zod: {
    input: `{\n  "username": "dev_user",\n  "age": 25\n}`,
    output: `const schema = z.object({\n  username: z.string(),\n  age: z.number()\n})`
  },
  typebox: {
    input: `{\n  "status": "success",\n  "count": 10\n}`,
    output: `const T = Type.Object({\n  status: Type.String(),\n  count: Type.Number()\n})`
  },
  mongoose: {
    input: `{\n  "title": "Post",\n  "views": 100\n}`,
    output: `const PostSchema = new Schema({\n  title: String,\n  views: Number\n})`
  },
  sql: {
    input: `{\n  "id": 1,\n  "username": "alice"\n}`,
    output: `CREATE TABLE users (\n  id INT,\n  username VARCHAR(255)\n);`
  },
  curl_fetch: {
    input: `curl 'https://api.example.com/data' -H 'Authorization: Bearer 123'`,
    output: `fetch('https://api.example.com/data', {\n  headers: {\n    'Authorization': 'Bearer 123'\n  }\n})`
  }
};

const categories = [
  { name: "SVG", languages: [{ id: 'jsx', label: 'to JSX' }, { id: 'svg_tailwind', label: 'to Tailwind JSX' }] },
  { name: "HTML", languages: [{ id: 'html_jsx', label: 'to JSX' }] },
  { name: "CSS", languages: [{ id: 'tailwind', label: 'to Tailwind' }, { id: 'css_obj', label: 'to JS Object' }] },
  { name: "JSON", languages: [
    { id: 'typescript', label: 'to TypeScript' },
    { id: 'zod', label: 'to Zod' },
    { id: 'typebox', label: 'to TypeBox' },
    { id: 'mongoose', label: 'to Mongoose Schema' },
    { id: 'sql', label: 'to MySQL' },
    { id: 'jsdoc', label: 'to JSDoc' },
    { id: 'graphql', label: 'to GraphQL' },
  ]},
  { name: "Network", languages: [{ id: 'curl_fetch', label: 'Curl to Fetch' }] }
];

export default function ConverterPage() {
  const initialId = categories[0].languages[0].id;

  const [targetLang, setTargetLang] = useState(initialId);
  const [inputCode, setInputCode] = useState(placeholders[initialId]?.input || '');
  const [outputCode, setOutputCode] = useState(placeholders[initialId]?.output || '');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<Conversion[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMounted, setIsMounted] = useState(false); // New: Prevents theme flicker
  const editorRef = useRef<MonacoEditor | null>(null);

  // 1. Initial Theme Logic (Server-safe)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // 2. Handle Initialization (Theme, Hash, Auth)
  useEffect(() => {
    setIsMounted(true);
    
    // Clean up URL Hash (the /# issue)
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Restore Theme from localStorage
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }
  }, []);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleFormat = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  const filteredCategories = categories.map(cat => ({
    ...cat,
    languages: cat.languages.filter(l => 
      l.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
      cat.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.languages.length > 0);

  const getCurrentConversionInfo = () => {
    for (const cat of categories) {
      const lang = cat.languages.find(l => l.id === targetLang);
      if (lang) return { category: cat.name, label: lang.label };
    }
    return { category: categories[0].name, label: categories[0].languages[0].label };
  };

  const currentInfo = getCurrentConversionInfo();

  const handleLanguageChange = (id: string) => {
    setTargetLang(id);
    if (placeholders[id]) {
      setInputCode(placeholders[id].input);
      setOutputCode(placeholders[id].output);
    }
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const getEditorLanguages = () => {
    let input = 'json', output = 'typescript';
    if (targetLang === 'jsx' || targetLang === 'svg_tailwind') input = 'xml';
    if (targetLang === 'html_jsx') input = 'html';
    if (targetLang === 'tailwind' || targetLang === 'css_obj') input = 'css';
    if (targetLang === 'sql') output = 'sql';
    if (targetLang === 'graphql') output = 'graphql';
    if (['jsx', 'html_jsx', 'svg_tailwind', 'css_obj', 'curl_fetch'].includes(targetLang)) output = 'javascript';
    if (targetLang === 'curl_fetch') input = 'shell';
    return { input, output };
  };

  const editorLangs = getEditorLanguages();

  const fetchHistory = useCallback(async (userId: string | undefined) => {
    if (!userId) { setHistory([]); return; }
    const { data, error: dbError } = await supabase.from('conversions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);
    if (!dbError && data) setHistory(data as Conversion[]);
  }, []);

  const handleConvert = useCallback(async () => {
    try {
      if (!inputCode.trim()) return;
      let result = "";
      const cleanInput = inputCode.trim();

      if (targetLang === 'typescript') {
        result = JsonToTS(JSON.parse(cleanInput)).join('\n\n');
      } else if (targetLang === 'css_obj') {
        const lines = cleanInput.split('\n');
        const obj = lines.reduce((acc: Record<string, string>, line) => {
          const [key, val] = line.split(':');
          if (key && val) {
            const camelKey = key.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
            acc[camelKey] = val.trim().replace(';', '').replace(/'/g, "\\'");
          }
          return acc;
        }, {});
        result = JSON.stringify(obj, null, 2);
      } else if (targetLang === 'svg_tailwind') {
        result = cleanInput
          .replace(/width="[^"]*"/, 'className={className}')
          .replace(/height="[^"]*"/, '')
          .replace(/stroke="[^"]*"/, 'stroke="currentColor"')
          .replace(/fill="[^"]*"/, 'fill="none"')
          .replace(/stroke-width=/g, 'strokeWidth=')
          .replace(/stroke-linecap=/g, 'strokeLinecap=')
          .replace(/stroke-linejoin=/g, 'strokeLinejoin=');
        result = `export const Icon = ({ className = "w-6 h-6" }) => (\n  ${result}\n);`;
      } else if (targetLang === 'curl_fetch') {
        const urlMatch = cleanInput.match(/'([^']+)'/) || cleanInput.match(/"([^"]+)"/);
        const url = urlMatch ? urlMatch[1] : 'https://api.example.com';
        result = `fetch('${url}', {\n  method: 'GET',\n  headers: {\n    'Content-Type': 'application/json'\n  }\n}).then(res => res.json());`;
      } else if (targetLang === 'typebox') {
        const parsed = JSON.parse(cleanInput);
        const fields = Object.entries(parsed).map(([k, v]) => `  ${k}: Type.${typeof v === 'number' ? 'Number' : 'String'}()`).join(',\n');
        result = `const T = Type.Object({\n${fields}\n})`;
      } else if (targetLang === 'html_jsx' || targetLang === 'jsx') {
        result = cleanInput.replace(/class=/g, 'className=').replace(/for=/g, 'htmlFor=').replace(/style="([^"]*)"/g, (match, p1) => {
          const camelCase = p1.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());
          return `style={{${camelCase}}}`;
        });
        if (targetLang === 'jsx') result = `export const IconComponent = (props) => (\n  ${result.replace('<svg', '<svg {...props}')}\n);`;
      } else {
        result = `// Converted ${targetLang}:\n${cleanInput}`;
      }
      setOutputCode(result);

      if (user && !user.is_anonymous) {
        const { error: saveError } = await supabase.from('conversions').insert([{ input_text: cleanInput, output_text: result, format_type: targetLang, user_id: user.id }]);
        if (!saveError) fetchHistory(user.id);
      }
    } catch (err) {
       console.error("Conversion error:", err);
    }
  }, [inputCode, targetLang, user, fetchHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleConvert();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleConvert]);

  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (!session) { await supabase.auth.signInAnonymously(); } 
      else if (currentUser && !currentUser.is_anonymous) { fetchHistory(currentUser.id); }
    };
    initSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser && !newUser.is_anonymous) { fetchHistory(newUser.id); } 
      else { setHistory([]); }
    });
    return () => subscription.unsubscribe();
  }, [fetchHistory]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const loadFromHistory = (item: Conversion) => {
    setInputCode(item.input_text);
    setOutputCode(item.output_text);
    setTargetLang(item.format_type);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setInputCode('');
    setOutputCode('');
  };

  // Prevent UI flashing during hydration
  if (!isMounted) return <div className="h-screen w-full bg-[#1e1e1e]" />;

  return (
    <main className={`font-google h-screen w-full flex flex-col transition-colors duration-300 ${theme === 'dark' ? 'bg-[#1e1e1e] text-white' : 'bg-gray-50 text-gray-900'}`}>
      
      <div className="h-10 bg-emerald-900 flex items-center justify-between px-6 z-60 shrink-0 text-white font-medium tracking-wide">
        <div className="flex w-full justify-end lg:gap-6 ">
          <a href="https://github.com/ShakhorChowdhury/dev-converter" target="_blank" rel="noopener noreferrer" className="font-bold px-4 bg-black/20 text-[14px] hover:text-white transition-colors flex items-center gap-1.5">
              GitHub 
          </a>
          <a href="#" target="_blank" rel="noopener noreferrer" className="hover:text-green-300 hover:scale-105 px-4 py-2 text-[14px] transition-colors">
            by Shakkhor
          </a>
        </div>
      </div>

      <header className={`h-16 border-b flex items-center px-4 justify-between z-50 shrink-0 ${theme === 'dark' ? 'bg-[#252526] border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-2 text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h1 className="text-xl text-green-900 font-black tracking-tight">DevConvert </h1>
          <button onClick={toggleTheme} className={`ml-4 p-2 rounded-full transition-all ${theme === 'dark' ? 'bg-gray-700 text-yellow-400' : 'bg-gray-100 text-gray-600'}`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="flex items-center gap-4">
           <span className="hidden md:block text-[12px] text-green-900 font-medium font-mono opacity-100">⌘ + Enter</span>
           <button onClick={handleConvert} className="bg-green-800 hover:bg-green-700 px-2 py-1 md:px-8 md:py-2 rounded text-[16px] font-bold text-white shadow-lg active:scale-95 transition-all">
             Run Conversion
           </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        
        {isSidebarOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
                onClick={() => setIsSidebarOpen(false)}
            />
        )}

        <aside className={`fixed inset-y-0 top-0 left-0 z-55 w-64 border-r transform transition-transform duration-300 lg:relative lg:translate-x-0 flex flex-col ${theme === 'dark' ? 'bg-[#252526] border-gray-700' : 'bg-white border-gray-200'} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-4 border-b border-green-700/30">
            <input 
              type="text" 
              placeholder="Search tools..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full px-3 py-2 rounded text-sm outline-none transition-all ${
                theme === 'dark' ? 'bg-[#1e1e1e] text-white border border-gray-700 focus:border-green-500' : 'bg-gray-100 text-gray-900 border border-gray-200 focus:border-green-400 focus:bg-white'
              }`}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {filteredCategories.map((cat) => (
              <div key={cat.name} className="mb-6">
                <h2 className={`text-[16px] font-bold uppercase tracking-wider mb-1 ${theme === 'dark' ? 'text-white' : 'text-green-900/90'}`}>{cat.name}</h2>
                <div className="flex flex-col gap-0.5 ml-1">
                  {cat.languages.map(l => (
                    <button key={l.id} onClick={() => handleLanguageChange(l.id)} className={`text-left pl-1 py-1.5 rounded text-[14px] transition-all ${targetLang === l.id ? 'bg-green-900 text-white shadow-md font-medium' : theme === 'dark' ? 'hover:bg-[#2d2d2d] text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-600 hover:text-green-500'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            
            {searchQuery === '' && history.length > 0 && (
              <>
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-4 mt-8 border-t border-gray-700/30 pt-4">Recent History</h2>
                <div className="space-y-2">
                  {history.map(item => (
                    <button key={item.id} onClick={() => loadFromHistory(item)} className={`w-full text-left p-2 rounded border text-[10px] truncate transition ${theme === 'dark' ? 'bg-[#2d2d2d] border-gray-700 text-gray-400 hover:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-400'}`}>
                      <div className="font-bold text-blue-500 mb-1">{item.format_type.toUpperCase()}</div>
                      <div className="opacity-50 italic">{item.input_text.substring(0, 20)}...</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          <div className={`p-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <p className='py-2 text-center text-[11px] lg:text-[14px]'>Login to save recent history</p>
            {(!user || user.is_anonymous) ? (
              <div className="space-y-2">
                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })} className="w-full bg-[#333] text-white py-2 rounded text-[13px] font-bold border border-gray-600">GitHub</button>
                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="w-full bg-white text-black py-2 rounded text-[13px] font-bold border border-gray-200 shadow-sm">Google</button>
              </div>
            ) : (
              <div className={`p-3 rounded border ${theme === 'dark' ? 'bg-[#2d2d2d] border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-[12px] text-center text-gray-500 truncate mb-2">{user.email}</p>
                <button onClick={() => supabase.auth.signOut()} className="w-full text-red-500 py-1.5 rounded text-[10px] font-bold hover:bg-red-500/10 transition">Sign Out</button>
              </div>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-h-0">
            
            <div className={`flex-none h-[45vh] lg:h-full lg:flex-4 flex flex-col border-b lg:border-b-0 lg:border-r min-w-0 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`flex-none px-4 py-2 flex justify-between items-center border-b ${theme === 'dark' ? 'bg-[#2d2d2d] border-gray-700/50' : 'bg-gray-100 border-gray-200'}`}>
                <span className={`text-[14px] md:text-[16px] uppercase font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-green-900'}`}>
                  {currentInfo.category} Source
                </span>
                <div className="flex gap-2">
                  <button onClick={handleFormat} className="text-[12px] md:text-[14px] px-3 py-1 rounded font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all">Format</button>
                  <button onClick={handleClear} className="text-[12px] md:text-[14px] px-3 py-1 rounded font-semibold bg-red-600 hover:bg-red-700 text-white transition-all">Clear</button>
                </div>
              </div>
              <div className="flex-1 min-h-0 pt-2">
                <Editor 
                  height="100%" 
                  language={editorLangs.input} 
                  theme={theme === 'dark' ? 'vs-dark' : 'light'} 
                  value={inputCode} 
                  onMount={handleEditorDidMount}
                  onChange={v => setInputCode(v || '')} 
                  options={{ minimap: { enabled: false }, automaticLayout: true, fontSize: 15 }} 
                />
              </div>
            </div>

            <div className="flex-none h-[45vh] lg:h-full lg:flex-6 flex flex-col min-w-0">
              <div className={`flex-none px-4 py-2 flex justify-between items-center border-b ${theme === 'dark' ? 'bg-[#2d2d2d] border-gray-700/50' : 'bg-gray-100 border-gray-200'}`}>
                <span className="text-[14px] md:text-[16px] text-green-900 font-bold uppercase">
                   {currentInfo.label.replace('to ', '')}
                </span>
                <button onClick={copyToClipboard} className={`flex items-center gap-2 text-[12px] md:text-[14px] px-3 py-1 rounded font-semibold transition-all ${copied ? 'bg-green-600 text-white' : 'bg-green-800 text-white'}`}>
                  Copy Snippet
                </button>
              </div>
              <div className="flex-1 min-h-0 pt-2">
                <Editor height="100%" language={editorLangs.output} theme={theme === 'dark' ? 'vs-dark' : 'light'} value={outputCode} options={{ readOnly: true, minimap: { enabled: false }, automaticLayout: true, fontSize: 15 }} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}