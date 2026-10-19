"""Assistente básico — o chat sem IA (§26).

Responde quando não há provedor de IA configurado ou quando todos falham (fora do
ar, cota esgotada). Não entende linguagem como um modelo de IA: reconhece
expressões comuns e usa a base de conhecimento da empresa. Mesmo assim conduz
uma conversa coerente:

- saudação e agradecimento têm resposta própria (sem buscar na base);
- problema descrito → o procedimento mais relevante da base, sem repetir artigo;
- "não entendi", "não consegui" → guia o procedimento um passo por vez;
  "pronto" e "não funcionou" avançam e, depois do último passo, oferecem o chamado;
- mensagem vaga ("não funciona") → pede detalhes em vez de chutar um artigo;
- pedido de chamado ou "não resolveu" → oferece abrir o chamado.

O estado vem das próprias mensagens: o último artigo citado e, no passo a passo,
o "Passo N de M" da última resposta.
"""

import re
from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass

from app.models.enums import ChatIntent
from app.services.ai.assistant import AssistantReply
from app.services.ai.classifier import normalize
from app.services.ai.embeddings import tokenize
from app.services.ai.rag import RetrievedSource

NO_ANSWER_TEXT = (
    "Não encontrei um procedimento para esse problema na nossa base de conhecimento.\n\n"
    "Posso abrir um chamado com o que você descreveu para a equipe de TI analisar. "
    "Deseja abrir agora?"
)
OFFER_TICKET_TEXT = (
    "Entendi. Posso abrir um chamado com a nossa equipe usando o que você descreveu nesta "
    "conversa. Deseja abrir agora?"
)
ALREADY_SHOWN_TEXT = (
    "O procedimento que tenho na base de conhecimento para isso é o que enviei acima.\n\n"
    "Se ele não resolveu, posso abrir um chamado com o que você descreveu para a equipe de TI "
    "analisar. Deseja abrir agora?"
)
NEED_DETAILS_TEXT = (
    "Pode me contar um pouco mais? Por exemplo: o que você estava tentando fazer, qual "
    "mensagem apareceu na tela e desde quando isso acontece."
)
GREETING_TEXT = (
    "Olá! Sou o Assistente de TI. Me conte o que está acontecendo — por exemplo, "
    '"a impressora não imprime" ou "não consigo conectar na VPN" — que eu procuro a '
    "solução com você."
)
FOLLOW_UP_TEXT = (
    "Certo! O problema continua ou foi resolvido? Se continuar, me conte o que aconteceu "
    "quando você tentou."
)
THANKS_TEXT = (
    'Que bom que deu certo! Se estiver tudo resolvido, use o botão "Resolvido" para encerrar '
    "a conversa. Se precisar de mais alguma coisa, é só escrever."
)
NO_STEPS_TEXT = (
    "Esse procedimento não está dividido em passos. Se tiver dúvida em alguma parte, posso "
    "abrir um chamado para a equipe de TI te ajudar. Deseja abrir agora?"
)
END_OF_STEPS_TEXT = (
    'Esses eram todos os passos de “{title}”. Se resolveu, é só tocar em "Resolvido".\n\n'
    "Se o problema continua, posso abrir um chamado para a equipe de TI analisar — a nossa "
    "conversa vai junto. Deseja abrir agora?"
)
STEP_TIP = 'Quando terminar, me diga "pronto". Se algo der diferente, me conte o que apareceu.'
STEP_HELP = (
    "Se não souber fazer ou não encontrar essa opção, posso abrir um chamado para a equipe de "
    'TI te ajudar. Ou diga "próximo" para tentar o passo seguinte.'
)

#: Abaixo disso (termos úteis), a mensagem é curta demais para buscar uma solução.
MIN_SEARCH_TERMS = 2
#: Respostas curtas como "pronto" ou "já fiz" avançam o passo a passo.
MAX_PROGRESS_WORDS = 6

_NOT_SOLVED = (
    "nao resolveu",
    "nao funcionou",
    "continua",
    "ainda nao",
    "nao deu certo",
    "mesmo erro",
    "nao ajudou",
)
_SOLVED = ("funcionou", "resolveu", "resolvido", "deu certo", "voltou a funcionar", "funcionando")
#: Pedido de explicação: vale em qualquer mensagem.
_CLARIFY = (
    "nao entendi",
    "nao entend",
    "nao compreendi",
    "explica melhor",
    "explicar melhor",
    "explique melhor",
    "como assim",
    "pode detalhar",
    "mais detalhes",
    "passo a passo",
)
#: "Travei": só no passo a passo ou em mensagem curta — "não consegui imprimir o
#: relatório do financeiro" é um problema novo, não um pedido de explicação.
_STUCK = (
    "nao consegui",
    "nao sei fazer",
    "nao sei como",
    "nao achei",
    "nao encontrei",
    "onde fica",
    "como faco isso",
    "como faz isso",
    "como eu faco",
    "complicado",
    "dificil",
)
MAX_STUCK_WORDS = 5


def _words(text: str) -> frozenset[str]:
    return frozenset(text.split())


# Conversa básica: mensagens feitas só destas palavras não são um problema de TI.
_FILLER = _words(
    "a o e de da do um uma me eu voce vc por favor muito mto tudo bem td ai entao ok certo"
)
_GREETINGS = _words(
    "oi ola opa hey hello hi salve eai bom boa dia tarde noite beleza blz como vai assistente "
    "ajuda ajudar preciso pode socorro help duvida"
)
_THANKS = _words(
    "obrigado obrigada obg brigado brigada valeu vlw agradeco show perfeito otimo top deu "
    "resolveu resolvido funcionou consegui era isso"
)
_PROGRESS = _words(
    "pronto feito fiz fizemos proximo seguinte pula pular continuar avancar ok certo beleza "
    "blz agora depois"
)

_STEP_LINE = re.compile(r"^\s*(\d+)[.)]\s+(\S.*)$")
_STEP_STATE = re.compile(r"^Passo (\d+) de (\d+):", re.MULTILINE)


@dataclass(frozen=True)
class PastMessage:
    """Mensagem anterior da conversa, como o assistente básico precisa vê-la."""

    role: str  # valor de MessageRole: USER, ASSISTANT ou SYSTEM
    content: str
    article_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class ArticleText:
    id: int
    title: str
    content: str


def _word_set(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", normalize(text)))


def says_not_solved(text: str) -> bool:
    normalized = normalize(text)
    return any(phrase in normalized for phrase in _NOT_SOLVED)


def says_solved(text: str) -> bool:
    """Frases como "funcionou" ou "deu certo", sem "não" na mensagem."""
    normalized = normalize(text)
    return "nao" not in _word_set(text) and any(phrase in normalized for phrase in _SOLVED)


def asks_clarification(text: str, *, in_steps: bool = False) -> bool:
    """Frases como "não entendi" ou "passo a passo" (e "não consegui", ver `_STUCK`)."""
    normalized = normalize(text)
    if any(phrase in normalized for phrase in _CLARIFY):
        return True
    stuck = any(phrase in normalized for phrase in _STUCK)
    return stuck and (in_steps or len(_word_set(text)) <= MAX_STUCK_WORDS)


def says_progress(text: str) -> bool:
    """Mensagens curtas como "pronto", "já fiz" ou "próximo"."""
    words = _word_set(text)
    return 0 < len(words) <= MAX_PROGRESS_WORDS and bool(words & _PROGRESS)


def is_vague(text: str) -> bool:
    """Mensagem com poucos termos úteis ("não funciona", "e agora?")."""
    return len(tokenize(text)) < MIN_SEARCH_TERMS


def first_problem(history: Sequence[PastMessage]) -> str | None:
    """Primeira mensagem do usuário que descreve algo (ignora "oi", "não funciona"...)."""
    return next((m.content for m in history if m.role == "USER" and not is_vague(m.content)), None)


def small_talk_reply(text: str, *, has_history: bool) -> AssistantReply | None:
    """Saudação, agradecimento ou pedido genérico de ajuda, respondidos sem a base.

    Sem isso, um "oi" virava "não encontrei um procedimento" e a oferta de chamado.
    """
    words = _word_set(text) - _FILLER
    if has_history and words and words <= _GREETINGS | _THANKS and words & _THANKS:
        return _reply(THANKS_TEXT)
    if words <= _GREETINGS:
        return _reply(FOLLOW_UP_TEXT if has_history else GREETING_TEXT)
    return None


def answer_from_sources(
    sources: list[RetrievedSource], *, cited: Collection[int] = ()
) -> AssistantReply:
    """O trecho mais relevante da base, sem repetir artigo já enviado."""
    if not sources:
        return _reply(NO_ANSWER_TEXT, suggest_ticket=True)
    best = sources[0]
    if best.article_id in cited:
        return _reply(ALREADY_SHOWN_TEXT, suggest_ticket=True)
    closing = "Isso resolveu o seu problema?"
    if len(_steps(best.excerpt)) >= 2:
        closing += ' Se preferir, diga "passo a passo" que eu te guio.'
    text = (
        f"Encontrei na base de conhecimento um procedimento que pode ajudar — "
        f"“{best.title}”:\n\n{best.excerpt}\n\n{closing}"
    )
    return AssistantReply(text=text, sources=[best], suggest_ticket=False, mode="heuristic")


class BasicAssistant:
    """Conversa sem IA sobre a base de conhecimento da empresa (ver docstring do módulo)."""

    def __init__(
        self,
        search: Callable[[str], list[RetrievedSource]],
        load_article: Callable[[int], ArticleText | None],
    ) -> None:
        self.search = search
        self.load_article = load_article

    def reply(
        self, text: str, intent: ChatIntent, history: Sequence[PastMessage]
    ) -> AssistantReply:
        if intent is ChatIntent.CREATE_TICKET:
            return _reply(OFFER_TICKET_TEXT, suggest_ticket=True)
        guided = self._continue_steps(text, history)
        if guided is not None:
            return guided
        if asks_clarification(text):
            explained = self._start_steps(history)
            if explained is not None:
                return explained
        if history and says_not_solved(text):
            return _reply(OFFER_TICKET_TEXT, suggest_ticket=True)
        if history and says_solved(text):
            return _reply(THANKS_TEXT)
        small_talk = small_talk_reply(text, has_history=bool(history))
        if small_talk is not None:
            return small_talk

        cited = {
            article_id for m in history if m.role == "ASSISTANT" for article_id in m.article_ids
        }
        query = text
        if is_vague(text):
            # "Não funciona", "é sem fio": sozinhas não dizem qual é o problema.
            problem = first_problem(history)
            if problem is None:
                return _reply(NEED_DETAILS_TEXT)
            if cited:
                return _reply(ALREADY_SHOWN_TEXT, suggest_ticket=True)  # não chuta outro artigo
            query = f"{problem}\n{text}"[:1000]
        return answer_from_sources(self.search(query), cited=cited)

    def _start_steps(self, history: Sequence[PastMessage]) -> AssistantReply | None:
        """Depois de um procedimento, "não entendi" o refaz um passo por vez.

        `None` se nenhum artigo foi enviado ainda (a mensagem segue o fluxo normal).
        """
        article_id = next(
            (
                m.article_ids[0]
                for m in reversed(history)
                if m.role == "ASSISTANT" and m.article_ids
            ),
            None,
        )
        article = self.load_article(article_id) if article_id is not None else None
        if article is None:
            return None
        steps = _steps(article.content)
        if len(steps) < 2:
            return _reply(NO_STEPS_TEXT, suggest_ticket=True)
        return _step(article, steps, 1, intro=True)

    def _continue_steps(self, text: str, history: Sequence[PastMessage]) -> AssistantReply | None:
        """Passo a passo em andamento: "pronto" avança e "não entendi" ajuda no passo atual."""
        last = next((m for m in reversed(history) if m.role == "ASSISTANT"), None)
        state = _STEP_STATE.search(last.content) if last and last.article_ids else None
        if last is None or state is None:
            return None
        current, total = int(state.group(1)), int(state.group(2))
        article = self.load_article(last.article_ids[0])
        steps = _steps(article.content) if article else []
        if article is None or len(steps) != total or not 1 <= current <= total:
            return None  # o artigo mudou ou saiu do ar: segue a conversa normal

        if asks_clarification(text, in_steps=True):
            return _step(article, steps, current, need_help=True)
        if says_solved(text):
            return _reply(THANKS_TEXT)
        if says_not_solved(text) or says_progress(text):
            if current < total:
                return _step(article, steps, current + 1)
            return _reply(
                END_OF_STEPS_TEXT.format(title=article.title),
                suggest_ticket=True,
                sources=[_source(article, steps[-1])],
            )
        return None


def _steps(content: str) -> list[str]:
    """Passos numerados (1., 2., 3. ...) do procedimento, em sequência."""
    steps: list[str] = []
    for line in content.splitlines():
        match = _STEP_LINE.match(line)
        if match and int(match.group(1)) == len(steps) + 1:
            steps.append(match.group(2).strip())
    return steps


def _source(article: ArticleText, excerpt: str) -> RetrievedSource:
    return RetrievedSource(article_id=article.id, title=article.title, excerpt=excerpt, score=1.0)


def _step(
    article: ArticleText,
    steps: list[str],
    number: int,
    *,
    intro: bool = False,
    need_help: bool = False,
) -> AssistantReply:
    # "Passo N de M:" no início da linha é o estado do passo a passo (ver _STEP_STATE).
    text = f"Passo {number} de {len(steps)}: {steps[number - 1]}"
    if intro:
        text = f"Vamos por partes — “{article.title}”.\n\n{text}"
    return AssistantReply(
        text=f"{text}\n\n{STEP_HELP if need_help else STEP_TIP}",
        sources=[_source(article, steps[number - 1])],
        suggest_ticket=need_help,
        mode="heuristic",
    )


def _reply(
    text: str, *, suggest_ticket: bool = False, sources: list[RetrievedSource] | None = None
) -> AssistantReply:
    return AssistantReply(
        text=text, sources=sources or [], suggest_ticket=suggest_ticket, mode="heuristic"
    )
