import { useEffect, useState } from "react";
import { Button } from "./Button";

interface TamilQuote {
  tamil: string;
  transliteration: string;
  meaning: string;
  author: string;
}

const tamilQuotes: TamilQuote[] = [
  {
    tamil: "வினைத்திட்பம் என்பது ஒருவன் வினைமேல் வினையூக்கம் உடைமை.",
    transliteration:
      "Vinai thitpam enbadhu oruvan vinaimel vinaiyukkam udamai.",
    meaning: "Firmness in action means having enthusiasm to act upon action.",
    author: "Thiruvalluvar",
  },
  {
    tamil: "கற்றதனால் ஆய பயனென்கொல் வாலறிவன் நற்றாள் தொழாஅர் எனின்.",
    transliteration:
      "Katradhanaal aaya payanenkol vaalarivan natraal thozhaaar enin.",
    meaning:
      "What is the use of learning if one does not worship the feet of the all-knowing?",
    author: "Thiruvalluvar — Kural #2",
  },
  {
    tamil: "நுண்ணிய நூல்பல கற்பினும் மற்றுந்தன் உண்மை யறிவே மிகும்.",
    transliteration: "Nunniya noolpala katpinum matrunthan unmai yarive migum.",
    meaning:
      "Even if one reads many subtle books, one's own true knowledge surpasses all.",
    author: "Thiruvalluvar",
  },
  {
    tamil: "இன்னா செய்தாரை ஒறுத்தல் அவர்நாண நன்னயம் செய்து விடல்.",
    transliteration:
      "Innaa seydharai oruththal avar naana nannayam seydhu vital.",
    meaning:
      "The best revenge against those who harm you is to shame them with kindness.",
    author: "Thiruvalluvar — Kural #314",
  },
  {
    tamil:
      "உற்றநோய் நீக்கி உறாஅமை முற்காக்கும் பெற்றியார்க்கு எண்ணிய முடியும்.",
    transliteration:
      "Utra noi neekki uraamai murkakkum petriyaarkku enniya mudiyum.",
    meaning:
      "Those who heal existing problems and prevent future ones will achieve their goals.",
    author: "Thiruvalluvar",
  },
  {
    tamil: "ஒழுக்கம் விழுப்பந் தரலான் ஒழுக்கம் உயிரினும் ஓம்பப் படும்.",
    transliteration:
      "Ozhukkam viluppan tharalan ozhukkam uyirirum oomba padum.",
    meaning:
      "Discipline gives greatness; therefore discipline must be guarded more than life itself.",
    author: "Thiruvalluvar — Kural #131",
  },
  {
    tamil: "எண்ணிய எண்ணியாங்கு எய்துப எண்ணியார் திண்ணியர் ஆகப் பெறின்.",
    transliteration:
      "Enniya enniyaangu eydhuva enniyaar thinniyar aagap perin.",
    meaning:
      "Those who think with resolve will achieve exactly what they set out to do.",
    author: "Thiruvalluvar — Kural #666",
  },
  {
    tamil: "பேதைமை என்பது பெருமையிற் கொள்ளாமை ஆதலால் அறிவுடையார் அஞ்சார்.",
    transliteration:
      "Pedhamai enbadhu perumaiyil kollaamai aadhalaal arivudaiyaar anjar.",
    meaning:
      "Ignorance is refusing greatness; the wise never fear stepping into their potential.",
    author: "Thiruvalluvar",
  },
  {
    tamil: "வேண்டுதல் வேண்டாமை இலானடி சேர்ந்தார்க்கு யாண்டும் இடும்பை இல.",
    transliteration:
      "Vendudhal vendaamai ilaanadi serndhaarkku yaandum idumbai ila.",
    meaning:
      "Those who surrender to the one beyond desire and aversion will never suffer.",
    author: "Thiruvalluvar — Kural #10",
  },
  {
    tamil: "அன்பிற்கும் உண்டோ அடைக்குந்தாழ் ஆர்வலர் புன்கணீர் பூசல் தரும்.",
    transliteration:
      "Anbirkumundo adaikkunthal aarvalr punkanneer poosal tharum.",
    meaning:
      "Can love be locked away? The tears of the devoted will break any barrier.",
    author: "Thiruvalluvar — Kural #71",
  },
];

function timeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

export function GreetingPopup({ username }: { username: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const today = new Date().toDateString();
    let lastGreeted = "";
    try {
      lastGreeted = localStorage.getItem("lastGreetedDate") ?? "";
    } catch {
      /* Storage may be unavailable. */
    }
    if (lastGreeted !== today) {
      setVisible(true);
      try {
        localStorage.setItem("lastGreetedDate", today);
      } catch {
        /* Storage may be unavailable. */
      }
    }
  }, []);

  if (!visible) return null;

  const now = new Date();
  const quote = tamilQuotes[dayOfYear(now) % tamilQuotes.length];
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Daily greeting"
    >
      <div className="modal-content modal-sm greeting-card">
        <h2 className="modal-title greeting-title">
          {timeBasedGreeting()}, {username}.
        </h2>
        <p className="greeting-date">{dateLabel}</p>
        <p className="greeting-quote-tamil">{quote.tamil}</p>
        <p className="greeting-quote-translit">{quote.transliteration}</p>
        <p className="greeting-quote-meaning">{quote.meaning}</p>
        <p className="greeting-quote-author">{quote.author}</p>
        <Button
          className="greeting-start-btn"
          onClick={() => setVisible(false)}
        >
          Start my day →
        </Button>
      </div>
    </div>
  );
}
