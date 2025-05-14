'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export default function Page() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingDots, setThinkingDots] = useState('');

  // Animate placeholder dots
  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setThinkingDots((prev) => (prev === '...' ? '' : prev + '.'));
    }, 400);

    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: newMessages }),
    });

    const data = await res.json();
    const reply = data.message;
    setMessages([...newMessages, reply]);
    setIsLoading(false);
  };

  return (
    <div style={{ padding: '1rem', fontFamily: 'Instrument Serif', maxWidth: '700px', margin: '0 auto' }}>
      <img
        src="/LIB_03.png"
        alt="Criterion Chat banner"
        style={{ width: '100%', borderRadius: '8px', marginBottom: '1rem' }}
      />


      <div>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: '2rem',
              fontSize: '1.15rem',
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: m.role === 'user' ? '#f0f0f0' : '#ffffff', // light gold
              border: m.role === 'user' ? '1px solid #ffffff' : '1px solid #ffffff',

            }}
          >
            <strong
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '1.3rem',
                color: m.role === 'user' ? '#333' : '#333',
              }}
            >
              {m.role === 'user' ? 'You:' : 'Criterion Librarian:'}
            </strong>

            <ReactMarkdown
              components={{
                strong: ({ node, ...props }) => (
                  <strong
                    style={{
                      display: 'block',
                      fontSize: '1.25rem',
                      fontWeight: '700',
                      marginTop: '1rem',
                      marginBottom: '0.5rem',
                    }}
                    {...props}
                  />
                ),
                p: ({ node, ...props }) => (
                  <p
                    style={{
                      marginBottom: '0.25rem',
                      lineHeight: '1.6',
                    }}
                    {...props}
                  />
                ),
                img: ({ node, ...props }) => (
                  <img
                    {...props}
                    style={{
                      maxWidth: '100%',
                      fontFamily: 'Instrument Serif',
                      borderRadius: '8px',
                      margin: '0.25rem 0 0.25rem',
                    }}
                  />
                ),
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    style={{
                      fontFamily: 'Instrument Serif',
                      color: '#0645AD',
                      textDecoration: 'none',
                      fontWeight: 'bold',
                      display: 'inline-block',
                      marginBottom: '2.5rem',
                    }}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ),
              }}
            >
              {m.content}
            </ReactMarkdown>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
  <input
    value={input}
    onChange={(e) => setInput(e.target.value)}
    placeholder={isLoading ? `Checking the closet${thinkingDots}` : 'What are you looking for?'}
    disabled={isLoading}
    style={{
      width: '100%',
      fontFamily: 'Instrument Serif',
      padding: '1rem',
      fontSize: '1.3rem',
      borderRadius: '6px',
      border: '1px solid #ccc',
      opacity: isLoading ? 0.7 : 1,
      boxSizing: 'border-box',
    }}
  />
</form>

<p style={{
  marginTop: '1rem',
  fontSize: '1rem',
  fontStyle: 'italic',
    width: '75%',
  color: '#888',
  fontFamily: 'Instrument Serif',
  textAlign: 'center',
}}>
  Try: <em>&ldquo;comedies,&rdquo; &ldquo;good date night movies,&rdquo; or &ldquo;tell me about Bergman&rdquo;</em>
</p>
<p style={{
  marginTop: '10rem',
  fontSize: '.75rem',
  color: '#888',
  fontFamily: 'Instrument Serif',
  textAlign: 'center',
}}>
  This is a fan-made project and is not affiliated with the Criterion Collection.
</p>
{/* <p style={{
  marginTop: '.05rem',
  fontSize: '.75rem',
  color: '#666',
  fontFamily: 'Instrument Serif',
  textAlign: 'center',
}}>
  <a href='www.bobarke.com'>www.bobarke.com</a>
</p> */}


    </div>
  );
}
