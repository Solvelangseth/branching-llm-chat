import { useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Add user message to chat history
    const userMessage = { role: 'user', content: message }
    setChatHistory(prev => [...prev, userMessage])
    setMessage('') // Clear input

    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })

      const data = await res.json()
      // Add assistant response to chat history
      const assistantMessage = { role: 'assistant', content: data.reply }
      setChatHistory(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error:', error)
      setChatHistory(prev => [...prev, { role: 'error', content: 'Error: Could not connect to server' }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="chat-container">
      <h1>Branching LLM Chat</h1>
      
      <div className="messages-container">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <strong>{msg.role === 'user' ? 'You' : 'Assistant'}:</strong>
            <p>{msg.content}</p>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <em>Assistant is typing...</em>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !message}>
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  )
}

export default App
