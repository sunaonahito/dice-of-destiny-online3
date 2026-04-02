import { useState, useEffect, useRef } from 'react';
import './App.css';

// Google Apps Script エンドポイント
const GAS_URL = "https://script.google.com/macros/s/AKfycbwmCBURkSOU-2zMqJs9KNaeU8goohM0bSIsklu7oxyDhJQtLj6GEKa1TMVmAm3NRgoYQg/exec";

const sendToGAS = async (data: object) => {
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
      redirect: 'follow' as RequestRedirect,
    });
  } catch (e) {
    console.error('GAS送信エラー:', e);
  }
};

// 型定義
type Phase =
  | 'title' | 'warning'
  | 'opening1' | 'opening2' | 'opening3'
  | 'stage1' | 'stage2' | 'stage3' | 'stage3_rolling' | 'stage3_losing'
  | 'ending1' | 'ending2' | 'special' | 'thanks';

type CardCategory = 'green' | 'pink' | 'blue' | 'yellow' | 'purple';

interface Card {
  id: string;
  category: CardCategory;
  text: string;
  description?: string;
  isLost: boolean;
}

const CATEGORY_LABELS: Record<CardCategory, string> = {
  green: '物',
  pink: '人',
  blue: '場所',
  yellow: '出来事',
  purple: '目標'
};

const CATEGORY_EXAMPLES: Record<CardCategory, string> = {
  green: 'PC, 携帯など',
  pink: '母, 友人など',
  blue: '自室, 学校など',
  yellow: '合格, 旅行など',
  purple: '就職, 結婚など'
};

const CATEGORY_HINTS: Record<CardCategory, string> = {
  green: 'あなたが大切にしている\nものは何ですか？',
  pink: 'あなたの人生で\n最も大切な人は誰ですか？',
  blue: '大切だと感じる場所はありますか？\nそれはどこですか？',
  yellow: 'あなたにとって\n忘れられない出来事は何ですか？',
  purple: 'あなたにとって\n意味のある目標は何ですか？'
};

function App() {
  const [phase, setPhase] = useState<Phase>('title');

  // ステージ1: カード
  const [cards, setCards] = useState<Card[]>([]);
  const [inputCategory, setInputCategory] = useState<CardCategory>('green');
  const [inputText, setInputText] = useState('');

  // ステージ2: 共有
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [shareText, setShareText] = useState('');

  // Special Stage: 最後のメッセージ
  const [recipientName, setRecipientName] = useState('');
  const [finalMessage, setFinalMessage] = useState('');

  // ステージ3: 喪失
  const [difficulty, setDifficulty] = useState<'EASY' | 'NORMAL' | 'HARD'>('NORMAL');
  const [diceRolls, setDiceRolls] = useState(0); // 振った回数
  const [currentDice, setCurrentDice] = useState<number>(1);
  const [isRolling, setIsRolling] = useState(false);
  const [cardsToLose, setCardsToLose] = useState(0);

  // データ収集
  const [anonymousCode, setAnonymousCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [lostCardsOrder, setLostCardsOrder] = useState<Array<{order: number; category: string; text: string}>>([]);
  const hasSent = useRef(false);

  // 背景画像のパス
  const bgImage = `url('${import.meta.env.BASE_URL}assets/fantasy_bg.jpg')`;

  // --- ハンドラー ---
  const addCard = () => {
    if (!inputText.trim()) return;
    if (cards.length >= 25) {
      alert('カードは最大25枚までです。');
      return;
    }
    const newCard: Card = {
      id: Date.now().toString(),
      category: inputCategory,
      text: inputText,
      isLost: false,
    };
    setCards([...cards, newCard]);
    setInputText('');
  };

  const removeCard = (cardId: string) => {
    setCards(cards.filter(c => c.id !== cardId));
  };

  const rollDice = () => {
    setIsRolling(true);
    setPhase('stage3_rolling');

    // アニメーション用のタイマー
    let rolls = 0;
    const interval = setInterval(() => {
      setCurrentDice(Math.floor(Math.random() * 6) + 1);
      rolls++;
      if (rolls > 15) {
        clearInterval(interval);
        const finalDice = Math.floor(Math.random() * 6) + 1;
        setCurrentDice(finalDice);
        setIsRolling(false);
        setDiceRolls(prev => prev + 1);

        // 喪失枚数の計算
        let loseCount = 0;
        if (difficulty === 'EASY') {
          loseCount = Math.max(1, finalDice - 2);
        } else if (difficulty === 'NORMAL') {
          loseCount = finalDice;
        } else {
          // HARD MODE
          loseCount = finalDice + 2;
        }

        const remainingActiveCards = cards.filter(c => !c.isLost).length;
        loseCount = Math.min(loseCount, remainingActiveCards);

        if (loseCount > 0) {
          setCardsToLose(loseCount);
          setPhase('stage3_losing');
        } else {
          if (remainingActiveCards === 0) {
            setPhase('ending1');
          } else {
            setPhase('stage3');
          }
        }
      }
    }, 100);
  };

  const handleLoseCard = (cardId: string) => {
    if (phase !== 'stage3_losing') return;
    const card = cards.find(c => c.id === cardId);
    if (!card || card.isLost) return;

    const order = lostCardsOrder.length + 1;
    setLostCardsOrder(prev => [...prev, { order, category: CATEGORY_LABELS[card.category], text: card.text }]);
    setCards(cards.map(c => c.id === cardId ? { ...c, isLost: true } : c));
    setCardsToLose(prev => prev - 1);
  };

  // 喪失枚数が0になったら状態を戻す
  useEffect(() => {
    if (phase === 'stage3_losing' && cardsToLose <= 0) {
      const remainingActiveCards = cards.filter(c => !c.isLost).length;
      if (remainingActiveCards === 0) {
        setPhase('ending1');
      } else {
        setPhase('stage3');
      }
    }
  }, [cardsToLose, phase, cards]);

  // thanks フェーズ到達時にゲームデータを GAS へ送信
  useEffect(() => {
    if (phase === 'thanks' && !hasSent.current) {
      hasSent.current = true;
      const endTime = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().replace('Z', '');
      const gameData = {
        type: 'game',
        game: 'Dice of Destiny',
        anonymousCode,
        startTime,
        endTime,
        timestamp: endTime,
        stage1_cards: cards.map(c => ({ category: CATEGORY_LABELS[c.category], text: c.text })),
        stage2_stories: cards
          .filter(c => c.description)
          .map(c => ({ category: CATEGORY_LABELS[c.category], text: c.text, story: c.description })),
        stage3_lostCards: lostCardsOrder,
        special_recipientName: recipientName,
        special_message: finalMessage,
      };
      sendToGAS(gameData);
    }
  }, [phase]);

  // タイトル画面表示時に localStorage から匿名コードを自動入力
  useEffect(() => {
    if (phase === 'title' && !anonymousCode) {
      try {
        const saved = localStorage.getItem('survey_anon_code');
        if (saved) setAnonymousCode(saved);
      } catch (e) {}
    }
  }, [phase]);

  // フェーズが変わるたびにスクロールを一番上に戻す
  useEffect(() => {
    const contentEl = document.querySelector('.content');
    if (contentEl) {
      contentEl.scrollTop = 0;
    }
  }, [phase]);

  // --- レンダーコンポーネント ---

  const renderTitle = () => (
    <div className="story-screen" style={{ flexDirection: 'column', textAlign: 'center', justifyContent: 'center' }}>
      <h1 style={{ fontSize: '4rem', marginBottom: '1rem', letterSpacing: '0.2rem', fontFamily: '"Times New Roman", Times, serif', fontWeight: 'bold', textShadow: '2px 2px 10px rgba(0,0,0,0.8)' }}>THE DICE OF DESTINY</h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '2rem', opacity: 1, textShadow: '1px 1px 5px rgba(0,0,0,0.8)' }}>The Educational Effects of Games about Loss: Focusing on well-being</p>
      <div style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.45)', borderRadius: '12px', padding: '1.2rem 1.8rem', display: 'inline-block' }}>
        <p style={{ fontSize: '0.95rem', marginBottom: '0.2rem', color: '#ffffff', fontWeight: 'bold', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>あなたの匿名コードが自動入力されています</p>
        <p style={{ fontSize: '0.85rem', marginBottom: '0.8rem', color: '#E0E8FF', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>先ほど作成したコードと一致していることを確認してください</p>
        <input
          type="text"
          value={anonymousCode}
          onChange={e => { setAnonymousCode(e.target.value.toUpperCase()); setCodeError(false); }}
          placeholder="例: 0622-136"
          maxLength={10}
          style={{ padding: '0.7rem 1.2rem', fontSize: '1.4rem', borderRadius: '8px', border: codeError ? '2px solid #f07070' : '2px solid rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.2)', color: '#fff', textAlign: 'center', letterSpacing: '0.3rem', width: '240px', outline: 'none', fontWeight: 'bold', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}
        />
        {codeError && <p style={{ color: '#f07070', fontSize: '0.85rem', marginTop: '0.4rem' }}>匿名コードを入力してください（例: 0622-136）</p>}
      </div>
      <button
        className="next-button"
        style={{ fontSize: '1.4rem', padding: '1.2rem 3rem', borderRadius: '50px', background: 'rgba(138, 43, 226, 0.6)', border: '2px solid white', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}
        onClick={() => {
          if (!anonymousCode.trim()) { setCodeError(true); return; }
          setStartTime(new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().replace('Z', ''));
          setPhase('warning');
        }}
      >
        体験を始める
      </button>
      <div style={{ marginTop: '2rem', fontSize: '0.85rem', opacity: 1, textAlign: 'center', lineHeight: '2', textShadow: '1px 1px 4px rgba(0,0,0,0.8)', fontWeight: 'bold' }}>
        このゲームは、喪失体験を通じた自己対話を目的としています。<br />
        ※ 参加と中止は完全に自由です。不快感を感じた場合はいつでも中止できます。
      </div>
    </div>
  );

  const renderWarning = () => (
    <div className="story-screen" style={{ flexDirection: 'column', textAlign: 'center', padding: '2rem' }}>
      <h2 style={{ fontSize: '2.5rem', marginBottom: '2rem', color: '#fff' }}>注意事項</h2>
      <div style={{ fontSize: '1.1rem', lineHeight: '2.2', textAlign: 'left', maxWidth: '800px', margin: '0 auto', background: 'rgba(255,255,255,0.1)', padding: '2rem', borderRadius: '15px', color: '#fff' }}>
        <h3 style={{ borderBottom: '1px solid #fff', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#fff' }}>この体験について</h3>
        <ul style={{ listStyleType: 'disc', paddingLeft: '2rem', marginBottom: '1.5rem', color: '#fff' }}>
          <li>これはゲームです。プレイ中の体験は現実とは異なります。</li>
          <li>このゲームへの参加および中止は、完全にあなたの自由です。</li>
          <li>ゲームへの参加やその結果が、個人の評価に影響することはありません。</li>
          <li>プレイ中に気分を害した場合は、すぐにゲームを中止することができます。</li>
          <li>誰もあなたにゲームへの参加や継続を強制することはできません。</li>
        </ul>
        <p style={{ fontWeight: 'bold', fontSize: '1.2rem', textAlign: 'center', marginTop: '2rem', color: '#fff' }}>
          所要時間: 約30分<br />
          <span style={{ fontSize: '1rem', fontWeight: 'normal', color: '#fff' }}>時間に余裕を持って体験してください。</span>
        </p>
      </div>
      <button
        className="next-button"
        style={{ marginTop: '3rem', fontSize: '1.2rem', padding: '1rem 3rem' }}
        onClick={() => setPhase('opening1')}
      >
        理解して体験を開始する
      </button>
    </div>
  );

  const renderOpening = () => {
    let text: string[] = [];
    if (phase === 'opening1') {
      text = [
        "突然、あなたの周りのすべてが暗闇に包まれます。",
        "目を開けると、あなたは奇妙で見知らぬ世界にいました。",
        "目の前には、奇抜でカラフルな衣装を着た子供が立っています。目が合うと、その子供はあなたに語りかけてきました。",
        "「君の心に話しかけているよ。君は予期せぬ不幸に見舞われたんだ。人生はもう二度と元には戻らないかもしれない。この事故はあまりにも大きく、君が大切にしているすべてを失ってしまうかもしれないんだ。」",
        "あなたは何が起きているのか理解できず、困惑して見つめ返します……"
      ];
    } else if (phase === 'opening2') {
      text = [
        "「『一体何を言っているんだ？』と思っているだろうね。それは当然だ。でも、お願いだ、僕を信じて。君がこれから体験することは、君の人生と深くつながっているんだ。」",
        "あなたがその言葉を処理する間もなく、さらなる驚きが訪れます。",
        "「この不幸に直面したのは君だけじゃない。他の人たちもそうだ。そして、君たちはチャンスを与えられたんだ――運命のサイコロ『ダイス・オブ・ディスティニー』と呼ばれるものを使うチャンスをね。」",
        "子供は身を乗り出し、その重要性を強調するかのように声を潜めました。",
        "「これは一番大事なことだから、忘れないで。このサイコロを使うことで、君は最も大切なものに気がつくかもしれない。それだけじゃない、今よりももっと良い人生へと導かれるかもしれないんだ。」"
      ];
    } else if (phase === 'opening3') {
      text = [
        "あなたがもっと明確な説明を求めようとしたその時……",
        "「詳しく説明してほしいのはわかるよ」と子供は遮ります。「でも時間がないんだ。もう始まるよ。」",
        "あなたは不安を感じつつも、この子供が真面目に話していることを理解します。",
        "「聞いてくれてありがとう」と子供は続けます。「さあ、君にとって最も大切なものをカードに書き出すんだよ。できるだけたくさんね。そして、他の人たちと同じように、運命のサイコロを振るんだ。」",
        "子供は突然、警告するかのようにあなたに顔を近づけて言いました。",
        "「覚えておいて――マスターの指示には必ず従うこと。勝手な行動はしちゃいけないよ。君の人生がこれによって良くなることを、心から願っているよ。」",
        "その言葉を最後に、子供はあなたの視界から消えていきました――現れたときと同じように。"
      ];
    }

    return (
      <div className="story-screen" style={{ alignItems: 'flex-start', paddingTop: '8rem' }}>
        <div className="story-text">
          {text.map((line, i) => <p key={i}>{line}</p>)}
          <button
            className="next-button"
            onClick={() => {
              if (phase === 'opening1') setPhase('opening2');
              else if (phase === 'opening2') setPhase('opening3');
              else setPhase('stage1');
            }}
          >
            次へ
          </button>
        </div>
        <img src={`${import.meta.env.BASE_URL}assets/図1.png`} className="character-image" style={{ opacity: 0.5, WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)', maskImage: 'radial-gradient(circle, black 30%, transparent 70%)', alignSelf: 'center' }} alt="Master" />
      </div>
    );
  };

  const renderStage1 = () => (
    <div className="stage-container">
      <div className="header">
        <h2>Stage1</h2>
        <h3 style={{ margin: '0.5rem 0' }}>Creating Precious Thing Cards<br />【大切なものカード】</h3>
        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
          <p><strong>ミッション:</strong> あなたにとって大切なものを挙げてください。</p>
          <p><strong>ゴール:</strong> 本当に大切なものが書かれたカードを５枚以上作成してください。<br/>各テーマの下に配置された空欄に入力するとカードが完成します。</p>
          <p style={{ marginTop: '1rem' }}><strong>所要時間:</strong> 5-10分</p>
          <p style={{ color: '#ffffff', fontWeight: 'bold' }}>正解や不正解はありません。思いついたことをそのまま書いてください。</p>
        </div>
        <p>現在の枚数: {cards.length} / 25</p>
        {cards.length >= 5 && (
          <div style={{ marginTop: '0.5rem' }}>
            <button className="next-button" style={{ fontSize: '1.4rem', padding: '1.2rem 3rem', borderRadius: '50px', background: 'rgba(138, 43, 226, 0.6)', border: '2px solid white' }} onClick={() => setPhase('stage2')}>2nd Stageへ進む</button>
          </div>
        )}
      </div>

      <div className="category-buttons">
        {(Object.keys(CATEGORY_LABELS) as CardCategory[]).map(cat => (
          <button
            key={cat}
            className={`category-btn ${cat} ${inputCategory === cat ? 'selected' : ''}`}
            onClick={() => setInputCategory(cat)}
            data-hint={CATEGORY_HINTS[cat]}
          >
            <span className="category-btn-label">{CATEGORY_LABELS[cat]}</span>
            <span className="category-btn-example">{CATEGORY_EXAMPLES[cat]}</span>
          </button>
        ))}
      </div>

      <div className="card-form">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="大切なものごとを入力..."
        />
        <button className="btn-add" onClick={addCard}>作成</button>
      </div>

      <div className="cards-grid">
        {cards.map(c => (
          <div key={c.id} className={`card ${c.category}`}>
            <button
              className="card-delete-btn"
              onClick={(e) => { e.stopPropagation(); removeCard(c.id); }}
              title="このカードを削除"
            >×</button>
            <span className="card-category">{CATEGORY_LABELS[c.category]}</span>
            <span className="card-text">{c.text}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStage2 = () => {
    const activeCards = cards.filter(c => !c.isLost);
    return (
      <div className="stage-container">
        <div className="header">
          <h2>Stage 2</h2>
          <h3 style={{ margin: '0.5rem 0' }}>Writing Stories<br />【秘められた物語】</h3>
          <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
            <p><strong>ミッション:</strong> カードの背景にあるストーリーを書いてください。</p>
            <p><strong>ゴール:</strong> 秘められたストーリーを書き上げる。</p>
            <p style={{ marginTop: '1rem' }}><strong>所要時間:</strong> 5-10分</p>
            <p style={{ marginTop: '1rem' }}>少なくとも１枚のカードを選択し、なぜそれが大切なのかを伝えるストーリーを書いてください。<br />誰かに話して聞かせるように書いてみましょう。</p>
            <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '4px', textAlign: 'left', display: 'inline-block' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#ccc' }}>例: 「場所　リビングルーム」<br />この場所は私が家族と過ごしたリビングルームです。いつもみんなで集まって、たくさんの思い出があります。私の母が……</p>
            </div>
          </div>
          {activeCards.some(c => c.description) ? (
            <div style={{ marginTop: '0.5rem' }}>
              <button className="next-button" style={{ fontSize: '1.4rem', padding: '1.2rem 3rem', borderRadius: '50px', background: 'rgba(138, 43, 226, 0.6)', border: '2px solid white' }} onClick={() => setPhase('stage3')}>3rd Stageへ進む</button>
            </div>
          ) : (
            <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem' }}>※ 最低1つのカードの物語を保存すると次へ進めます</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '2rem', flex: 1 }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="cards-grid">
              {activeCards.map(c => {
                const hasDescription = !!c.description;
                return (
                  <div
                    key={c.id}
                    className={`card ${c.category} ${hasDescription ? 'described' : ''}`}
                    style={{
                      transform: selectedCardId === c.id ? 'scale(1.1) translateY(-10px)' : 'none',
                      border: selectedCardId === c.id ? '4px solid white' : hasDescription ? '3px solid rgba(255,255,255,0.5)' : 'none',
                      cursor: hasDescription ? 'default' : 'pointer',
                      opacity: hasDescription ? 0.7 : 1,
                    }}
                    onClick={() => { if (!hasDescription) setSelectedCardId(c.id); }}
                  >
                    {hasDescription && <span className="card-described-badge">記入済み ✓</span>}
                    <span className="card-category">{CATEGORY_LABELS[c.category]}</span>
                    <span className="card-text">{c.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1 }} className="share-area">
            {selectedCardId ? (
              <>
                <h3>選択中のカード: {cards.find(c => c.id === selectedCardId)?.text}</h3>
                <textarea
                  value={shareText}
                  onChange={e => setShareText(e.target.value)}
                  placeholder="伝えたい相手を想像し、関連するエピソードや大切にしている理由を書き記してください..."
                />
                <button className="btn-add" onClick={() => {
                  setCards(cards.map(c => c.id === selectedCardId ? { ...c, description: shareText } : c));
                  setShareText('');
                  setSelectedCardId(null);
                }}>保存する</button>
              </>
            ) : (
              <p>左のカードから一つ選んでください。</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStage3 = () => {
    return (
      <div className="stage-container">
        <div className="header">
          <h2>Stage 3</h2>
          <h3 style={{ margin: '0.5rem 0' }}>Roll the Dice of Destiny<br />【運命のダイス】</h3>
          <p>運命のダイスを振るたびに、あなたの大切なものを手放さなければなりません。</p>
          <p style={{ marginTop: '0.5rem', fontWeight: 'bold' }}>所要時間: 5-10分</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem' }}>※モード（難易度）を選択して喪失する枚数を調整しましょう</p>
          <div className="stats" style={{ display: 'flex', justifyContent: 'center', gap: '2rem' }}>
            <span>残りカード: {cards.filter(c => !c.isLost).length}枚</span>
            <span>ダイス使用回数: {diceRolls} / 最低4回</span>
          </div>
        </div>

        {phase === 'stage3' && (
          <div className="dice-container">
            <div className="difficulty-buttons">
              <button
                className={`difficulty-btn ${difficulty === 'EASY' ? 'selected' : ''}`}
                onClick={() => setDifficulty('EASY')}
              >
                <span className="difficulty-btn-label">EASY</span>
              </button>
              <button
                className={`difficulty-btn ${difficulty === 'NORMAL' ? 'selected' : ''}`}
                onClick={() => setDifficulty('NORMAL')}
              >
                <span className="difficulty-btn-label">NORMAL</span>
              </button>
              <button
                className={`difficulty-btn ${difficulty === 'HARD' ? 'selected' : ''}`}
                onClick={() => setDifficulty('HARD')}
              >
                <span className="difficulty-btn-label">HARD</span>
              </button>
            </div>
            <p className="difficulty-desc">
              {difficulty === 'EASY' && '出た目−2枚のカードを喪失（最低1枚）'}
              {difficulty === 'NORMAL' && '出た目と同じ枚数のカードを喪失'}
              {difficulty === 'HARD' && '出た目+2枚のカードを喪失'}
            </p>
            <button className="next-button" onClick={rollDice} style={{ fontSize: '1.5rem', padding: '1rem 3rem' }}>
              ダイスを振る
            </button>
          </div>
        )}

        {phase === 'stage3_rolling' && (
          <div className="dice-container">
            <div className={`dice ${isRolling ? 'rolling' : ''}`}>
              {currentDice}
            </div>
            <h3>運命を決定中...</h3>
          </div>
        )}

        {phase === 'stage3_losing' && (
          <div className="dice-container">
            <div className="dice">{currentDice}</div>
            <h3 className="lose-instruction">
              運命により {cardsToLose} 枚のカードを失います。<br />
              失うカードをクリックして選択してください。
            </h3>
          </div>
        )}

        <div className="cards-grid">
          {cards.map(c => (
            <div
              key={c.id}
              className={`card ${c.category} ${c.isLost ? 'lost' : ''}`}
              onClick={() => handleLoseCard(c.id)}
              style={{ cursor: phase === 'stage3_losing' && !c.isLost ? 'crosshair' : 'default' }}
            >
              <span className="card-category">{CATEGORY_LABELS[c.category]}</span>
              <span className="card-text">{c.text}</span>
            </div>
          ))}
        </div>

        {phase === 'stage3' && diceRolls >= 4 && (
          <div style={{ textAlign: 'center', marginTop: 'auto' }}>
            <button className="next-button" onClick={() => setPhase('ending1')}>エンディングへ進む</button>
          </div>
        )}
      </div>
    );
  };

  const renderEnding = () => {
    let text: string[] = [];
    if (phase === 'ending1') {
      text = [
        "いつの間にか、奇抜な衣装を着た子供があなたの隣に立っていました。",
        "「やあ！ 『運命のサイコロ』を使ってみたんだね？」",
        "子供は再び話しかけてきました。",
        "「どのカードが残って、どのカードを失ったの？」",
        "失われたカードを見つめながら、子供は尋ねました。「この体験は、君にとってどんな意味があった？」",
        "――どんな意味があっただろう？ あなたは考え込みます。",
        "「そうだ！ 現実の世界に戻る前に、君の大切な人（家族、パートナー、友人など）へ、この体験を通じて感じたことや考えたことをメッセージにしてみない？」"
      ];
    } else if (phase === 'ending2') {
      text = [
        "すべてのサイコロを振り終え、あなたはゆっくりと目を閉じます。",
        "すると、マスターの声が聞こえてきます。",
        "「人生で手にするすべてのものは、いつか失われる日が来る。誰しも、例外なく、死を迎える時が来るのだ。」",
        "さらに、声は続きます。",
        "「だが、今この瞬間、お前は生きている。そして、お前が大切に思うものは、お前と共にあるのだ。」",
        "マスターの声が聞こえなくなり、再び目を開けると、あなたは以前と同じ場所にいました。",
        "あなたは不思議な体験をしたことに気づきます――運命によって最も大切なものが失われるという体験を。",
        "あなたは深く息を吸い込みます。心は穏やかです。そして、人生が以前よりも少し明るく感じられるのです。"
      ];
    }

    return (
      <div className="story-screen" style={{ alignItems: 'flex-start', paddingTop: '8rem' }}>
        <div className="story-text">
          {text.map((line, i) => <p key={i}>{line}</p>)}
          {phase === 'ending1' && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', gap: '2rem', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 'bold' }}>
              <span>手元に残ったカード: <strong>{cards.filter(c => !c.isLost).length}枚</strong></span>
              <span>失ったカード: <strong>{cards.filter(c => c.isLost).length}枚</strong></span>
            </div>
          )}
          <button
            className="next-button"
            onClick={() => {
              if (phase === 'ending1') setPhase('special');
              else setPhase('thanks');
            }}
          >
            {phase === 'ending2' ? '体験を完了する' : '次へ'}
          </button>
        </div>
        <img src={phase === 'ending1' ? `${import.meta.env.BASE_URL}assets/Master1 2.png` : `${import.meta.env.BASE_URL}assets/Master2.png`} className="character-image" style={{ opacity: 0.5, WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)', maskImage: 'radial-gradient(circle, black 30%, transparent 70%)', alignSelf: 'center' }} alt="Character" />
      </div>
    );
  };

  const renderThanks = () => (
    <div className="story-screen" style={{ flexDirection: 'column', textAlign: 'center', justifyContent: 'center', padding: '2rem' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '2.5rem', letterSpacing: '0.2rem', fontFamily: '"Times New Roman", Times, serif', fontWeight: 'bold', color: '#fff', textShadow: '2px 2px 10px rgba(0,0,0,0.8)' }}>THE DICE OF DESTINY</h1>
      <div style={{ 
        background: 'rgba(0, 0, 0, 0.7)', 
        padding: '3rem', 
        borderRadius: '20px', 
        boxShadow: '0 0 30px rgba(0,0,0,0.5)',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <p style={{ fontSize: '1.3rem', lineHeight: '2.2', opacity: 1, color: '#fff' }}>
          この体験が、<br />
          あなたの健康と幸福の支えとなり、<br />
          より充実した人生を送る一助となることを願っています。<br />
          いつかまた、<br />
          ご一緒できることを楽しみにしています。<br />
          本当にありがとうございました。
        </p>
      </div>
      <button
        className="next-button"
        style={{ marginTop: '3rem', fontSize: '1.2rem', padding: '1rem 3rem', borderRadius: '50px' }}
        onClick={() => {
          setPhase('title');
          setCards([]);
          setInputText('');
          setSelectedCardId(null);
          setShareText('');
          setDiceRolls(0);
          setCurrentDice(1);
          setCardsToLose(0);
          setRecipientName('');
          setFinalMessage('');
          setAnonymousCode('');
          setCodeError(false);
          setStartTime('');
          setLostCardsOrder([]);
          hasSent.current = false;
        }}
      >
        タイトル画面へ
      </button>
      <a
        href="https://sunaonahito.github.io/game-survey/"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-block', marginTop: '1rem', fontSize: '1.2rem', padding: '1rem 3rem', borderRadius: '50px', background: 'rgba(232,164,74,0.6)', border: '2px solid rgba(232,164,74,0.9)', color: '#fff', textDecoration: 'none', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.4)' }}
      >
        体験後のご質問へ
      </a>
    </div>
  );

  const renderSpecial = () => {
    return (
      <div className="stage-container">
        <div className="header">
          <h2>Special Stage</h2>
          <h3 style={{ margin: '0.5rem 0' }}>【あの人への手紙】</h3>
          <p>大切な人（家族、パートナー、友人など）へ、この体験を通じて感じたことや考えたことをメッセージにしてみましょう</p>
        </div>

        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ flex: 1 }}>
            <h3>手元に残ったカード（{cards.filter(c => !c.isLost).length}枚）</h3>
            <div className="cards-grid" style={{ zoom: 0.8 }}>
              {cards.filter(c => !c.isLost).map(c => (
                <div key={c.id} className={`card ${c.category}`}>
                  <span className="card-text">{c.text}</span>
                </div>
              ))}
            </div>

            <h3 style={{ marginTop: '2rem' }}>あなたが失ったカード（{cards.filter(c => c.isLost).length}枚）</h3>
            <div className="cards-grid" style={{ zoom: 0.8 }}>
              {cards.filter(c => c.isLost).map(c => (
                <div key={c.id} className={`card ${c.category} lost-no-label`}>
                  <span className="card-text">{c.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1 }} className="share-area">
            <input
              type="text"
              placeholder="大切な人の名前や関係.."
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              style={{ padding: '1rem', fontSize: '1rem', borderRadius: '4px', border: 'none', background: '#f5f5f0', color: '#000', width: '100%', boxSizing: 'border-box' }}
            />
            <textarea
              placeholder="大切な人を想い、ここにメッセージを記します..."
              value={finalMessage}
              onChange={(e) => setFinalMessage(e.target.value)}
            />
            <button className="next-button" onClick={() => setPhase('ending2')}>次へ</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="game-container" style={{ backgroundImage: bgImage }}>
      <div className={`overlay ${(phase === 'title' || phase === 'thanks') ? 'title-mode' : ''}`}></div>
      <div className="content">
        {phase === 'title' && renderTitle()}
        {phase === 'warning' && renderWarning()}
        {phase.startsWith('opening') && renderOpening()}
        {phase === 'stage1' && renderStage1()}
        {phase === 'stage2' && renderStage2()}
        {phase.startsWith('stage3') && renderStage3()}
        {phase === 'special' && renderSpecial()}
        {phase.startsWith('ending') && renderEnding()}
        {phase === 'thanks' && renderThanks()}
      </div>
    </div>
  );
}

export default App;
