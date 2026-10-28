import React, { useState, useEffect, useRef } from 'react';
import { Sale } from '../types';
import {
  todayKey,
  parseVoiceSale,
  playSavedSound,
  isMobileBrowser,
} from '../utils/storage';

interface SaleModalProps {
  isOpen: boolean;
  initialType: 'cash' | 'debt';
  fromVoice: boolean;
  onClose: () => void;
  onSave: (sale: Sale) => void;
  onShowToast: (message: string) => void;
}

// Global browser SpeechRecognition type declaration
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

export const SaleModal: React.FC<SaleModalProps> = ({
  isOpen,
  initialType,
  fromVoice,
  onClose,
  onSave,
  onShowToast,
}) => {
  const [entryType, setEntryType] = useState<'cash' | 'debt'>(initialType);
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [customer, setCustomer] = useState('');

  // Voice states
  const [voiceTitle, setVoiceTitle] = useState('Listening…');
  const [voiceText, setVoiceText] = useState('Say: Sold rice 2000 to Emeka debt');
  const [voiceSuccess, setVoiceSuccess] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const voiceTranscriptRef = useRef('');
  const voiceDataUrlRef = useRef<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recordingPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const recordingResolveRef = useRef<(() => void) | null>(null);

  const itemInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);

  const stopVoiceCapture = (): Promise<void> => {
    const pendingRecording = recordingPromiseRef.current || Promise.resolve();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // already stopped
      }
    }
    if (recorderStreamRef.current && (!recorderRef.current || recorderRef.current.state === 'inactive')) {
      recorderStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    recorderRef.current = null;
    recorderStreamRef.current = null;
    setIsListening(false);
    return pendingRecording;
  };

  const applyVoiceResult = (transcript: string) => {
    voiceTranscriptRef.current = transcript;
    const parsed = parseVoiceSale(transcript);
    if (!parsed || !parsed.item) {
      setVoiceTitle('I heard you');
      setVoiceText('Please check the fields below and finish the sale.');
      setVoiceSuccess(false);
      onShowToast('I could not find the item and amount. Please check the form.');
      return;
    }
    setItem(parsed.item);
    setAmount(String(parsed.amount));
    if (parsed.type === 'debt') {
      setCustomer(parsed.customer);
      setEntryType('debt');
    } else {
      setEntryType('cash');
    }
    setVoiceTitle('Sale details filled');
    setVoiceText(`Heard: “${transcript}”`);
    setVoiceSuccess(true);
  };

  const beginSpeechRecognition = (recorderReady: boolean) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceTitle('Voice typing is not available here');
      setVoiceText(
        recorderReady
          ? 'Your recording is ready. Fill the fields below.'
          : 'Fill the fields below manually, or use Chrome or Safari with microphone support.'
      );
      setIsListening(false);
      setShowRetry(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      setVoiceTitle('Listening…');
      setVoiceText('Say: Sold rice 2000 to Emeka debt');
      setShowRetry(false);
      setIsListening(true);

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        applyVoiceResult(transcript);
        stopVoiceCapture();
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        stopVoiceCapture();
        const messages: Record<string, string> = {
          'not-allowed': 'Allow microphone access in your browser settings, then tap Try again.',
          'service-not-allowed': 'Speech access is blocked by this browser. Try Chrome or Safari.',
          'audio-capture': 'Another app is using the microphone. Close it, then tap Try again.',
          'no-speech': 'No speech detected. Speak closer to the phone, then tap Try again.',
          network: 'The browser voice service is unavailable. Check permission or use manual entry.',
        };
        setVoiceTitle('Could not hear that');
        setVoiceText(messages[event.error] || 'Check microphone permission, then tap Try again.');
        setShowRetry(true);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setVoiceTitle('Microphone is ready');
      setVoiceText(
        recorderReady
          ? 'Your recording is kept. Tap Try again, then speak clearly.'
          : 'Tap Try again and speak clearly after the listening message appears.'
      );
      setIsListening(false);
      setShowRetry(true);
    }
  };

  const startVoiceCapture = async () => {
    setIsListening(true);
    let recorderReady = false;

    if (!isMobileBrowser()) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          recorderStreamRef.current = stream;
          const recorder = new MediaRecorder(stream);
          recorderRef.current = recorder;
          const mimeType = recorder.mimeType || 'audio/webm';
          recorderChunksRef.current = [];
          recordingPromiseRef.current = new Promise((resolve) => {
            recordingResolveRef.current = resolve;
          });

          recorder.ondataavailable = (event) => {
            if (event.data.size) {
              recorderChunksRef.current.push(event.data);
            }
          };

          recorder.onstop = () => {
            const finish = () => {
              stream.getTracks().forEach((track) => track.stop());
              if (recordingResolveRef.current) {
                recordingResolveRef.current();
                recordingResolveRef.current = null;
              }
            };
            if (recorderChunksRef.current.length) {
              const reader = new FileReader();
              reader.onloadend = () => {
                voiceDataUrlRef.current = reader.result as string;
                finish();
              };
              reader.readAsDataURL(new Blob(recorderChunksRef.current, { type: mimeType }));
            } else {
              finish();
            }
          };

          recorder.start();
          recorderReady = true;
        }
      } catch {
        if (recordingResolveRef.current) recordingResolveRef.current();
        recordingResolveRef.current = null;
        if (recorderStreamRef.current) {
          recorderStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        recordingPromiseRef.current = Promise.resolve();
        recorderRef.current = null;
        recorderStreamRef.current = null;
      }
    }

    beginSpeechRecognition(recorderReady);
  };

  useEffect(() => {
    if (isOpen) {
      setEntryType(initialType);
      setItem('');
      setAmount('');
      setCustomer('');
      voiceTranscriptRef.current = '';
      voiceDataUrlRef.current = null;
      setVoiceTitle('Listening…');
      setVoiceText('Say: Sold rice 2000 to Emeka debt');
      setVoiceSuccess(false);
      setShowRetry(false);
      document.body.style.overflow = 'hidden';

      if (fromVoice) {
        startVoiceCapture();
      }

      setTimeout(() => {
        itemInputRef.current?.focus();
      }, 70);
    } else {
      stopVoiceCapture();
      document.body.style.overflow = '';
    }

    return () => {
      stopVoiceCapture();
      document.body.style.overflow = '';
    };
  }, [isOpen, initialType, fromVoice]);

  if (!isOpen) return null;

  const handleRetryVoice = () => {
    stopVoiceCapture();
    voiceTranscriptRef.current = '';
    voiceDataUrlRef.current = null;
    setShowRetry(false);
    setIsListening(true);
    beginSpeechRecognition(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedItem = item.trim();
    const parsedAmount = Number(amount);
    const trimmedCustomer = customer.trim();

    if (!trimmedItem) {
      onShowToast('Add the item name first.');
      itemInputRef.current?.focus();
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      onShowToast('Add a valid amount.');
      amountInputRef.current?.focus();
      return;
    }
    if (entryType === 'debt' && !trimmedCustomer) {
      onShowToast('Add the customer name.');
      customerInputRef.current?.focus();
      return;
    }

    await stopVoiceCapture();

    const newSale: Sale = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: entryType,
      item: trimmedItem,
      amount: parsedAmount,
      customer: entryType === 'debt' ? trimmedCustomer : '',
      createdAt: new Date().toISOString(),
      dateKey: todayKey(),
      archived: false,
      paid: false,
      voiceDataUrl: voiceDataUrlRef.current,
      transcript: voiceTranscriptRef.current || '',
    };

    onSave(newSale);
    playSavedSound();
    onClose();
  };

  const modalTitle = fromVoice
    ? 'Speak a sale'
    : entryType === 'debt'
    ? 'Debt sale'
    : 'Cash sale';

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="sheet-handle" aria-hidden="true"></div>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{fromVoice ? 'VOICE SALE' : 'NEW SALE'}</p>
            <h2 id="modalTitle">{modalTitle}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close sale form"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {fromVoice && (
          <div className={`voice-status ${voiceSuccess ? 'is-success' : ''} ${isListening ? 'is-listening' : ''}`}>
            <span className="voice-pulse" aria-hidden="true"></span>
            <div>
              <strong>{voiceTitle}</strong>
              <span>{voiceText}</span>
            </div>
            {showRetry && (
              <button
                className="voice-retry"
                type="button"
                onClick={handleRetryVoice}
              >
                Try again
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleFormSubmit} noValidate>
          {fromVoice && (
            <div className="type-chooser">
              <span className="field-label">SALE TYPE</span>
              <div className="type-options">
                <button
                  type="button"
                  className={`type-option ${entryType === 'cash' ? 'is-selected' : ''}`}
                  onClick={() => setEntryType('cash')}
                >
                  Cash
                </button>
                <button
                  type="button"
                  className={`type-option ${entryType === 'debt' ? 'is-selected' : ''}`}
                  onClick={() => setEntryType('debt')}
                >
                  Debt
                </button>
              </div>
            </div>
          )}

          <label className="field-label" htmlFor="itemInput">
            ITEM NAME
          </label>
          <input
            id="itemInput"
            ref={itemInputRef}
            className="text-input"
            type="text"
            name="item"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="e.g. Rice, Milo, Peak milk"
            autoComplete="off"
            required
          />

          <label className="field-label" htmlFor="amountInput">
            AMOUNT
          </label>
          <div className="amount-input-wrap">
            <span>₦</span>
            <input
              id="amountInput"
              ref={amountInputRef}
              className="text-input amount-input"
              type="number"
              name="amount"
              inputMode="decimal"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          {entryType === 'debt' && (
            <div>
              <label className="field-label" htmlFor="customerInput">
                CUSTOMER NAME
              </label>
              <input
                id="customerInput"
                ref={customerInputRef}
                className="text-input"
                type="text"
                name="customer"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Who is taking it?"
                autoComplete="name"
                required
              />
            </div>
          )}

          <p className="form-hint">
            {entryType === 'debt'
              ? 'This stays in Owing Me until the customer pays.'
              : 'Cash sales are saved instantly on this phone.'}
          </p>

          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Not now
            </button>
            <button className="primary-button" type="submit">
              Save sale
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
