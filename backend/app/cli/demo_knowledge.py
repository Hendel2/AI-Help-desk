"""Artigos da base de conhecimento da empresa demo (§29, §92).

São a fonte das respostas do Assistente de TI na demonstração.
Formato: (categoria, título, resumo, conteúdo, destacado).
"""

KNOWLEDGE_ARTICLES: list[tuple[str, str, str, str, bool]] = [
    (
        "VPN",
        "Falha de autenticação na VPN",
        "O que fazer quando a VPN recusa usuário e senha.",
        'Quando a VPN mostrar "falha de autenticação":\n\n'
        "1. Confirme que a sua senha de rede não expirou: entre no portal de senhas e, se "
        "necessário, defina uma nova senha. A VPN usa a mesma senha da rede.\n"
        "2. Atualize o cliente VPN para a versão mais recente disponível no portal de software.\n"
        "3. Reinicie o computador e tente conectar novamente.\n\n"
        "Se o erro continuar após esses passos, abra um chamado na categoria VPN informando o "
        "horário da tentativa e a mensagem exibida.",
        True,
    ),
    (
        "VPN",
        "VPN desconectando com frequência",
        "Quedas da VPN durante reuniões ou chamadas.",
        "Quedas frequentes da VPN costumam ser causadas por Wi-Fi instável ou pela economia "
        "de energia da placa de rede.\n\n"
        "1. Prefira a rede cabeada ou aproxime-se do roteador.\n"
        "2. Desative a economia de energia da placa de rede nas configurações do Windows.\n"
        "3. Evite downloads grandes enquanto estiver conectado.\n\n"
        "Se a conexão cair mais de três vezes por hora mesmo assim, abra um chamado.",
        False,
    ),
    (
        "E-mail",
        "Caixa de e-mail bloqueada",
        "Desbloqueio de conta após várias tentativas de senha.",
        "A conta de e-mail é bloqueada por 30 minutos após 5 tentativas de senha incorretas. "
        "Aguarde esse período e entre novamente com a senha correta.\n\n"
        'Se você esqueceu a senha, use a opção "Esqueci minha senha" no portal. Nunca '
        "informe a sua senha por e-mail, chat ou telefone: a equipe de TI não pede senhas.",
        True,
    ),
    (
        "E-mail",
        "E-mails externos não chegam",
        "Mensagens de clientes voltando ou indo para a quarentena.",
        "Verifique primeiro a pasta Lixo Eletrônico e a quarentena do filtro de spam. Se o "
        "remetente for confiável, adicione o domínio à lista de remetentes seguros.\n\n"
        "Se as mensagens estiverem voltando com erro para o remetente, abra um chamado "
        "anexando o e-mail de retorno (bounce) para análise.",
        False,
    ),
    (
        "Impressora",
        "Impressora atolando papel",
        "Como retirar papel preso e evitar novos atolamentos.",
        "1. Desligue a impressora e abra a tampa traseira.\n"
        "2. Retire o papel preso puxando com as duas mãos, sem rasgar.\n"
        "3. Verifique se o rolete de alimentação está limpo.\n"
        "4. Use somente papel A4 de 75 g/m² e não encha a bandeja acima da marca.\n\n"
        "Se o atolamento se repetir em todas as impressões, abra um chamado: o rolete pode "
        "precisar de troca.",
        True,
    ),
    (
        "Rede",
        "Internet lenta",
        "Diagnóstico rápido de lentidão na navegação.",
        "1. Teste em outro site para descartar um problema específico.\n"
        "2. Reinicie o computador e, se estiver no Wi-Fi, conecte-se à rede EMPRESA-5G.\n"
        "3. Feche abas e programas que usam muita banda (vídeos, sincronização de arquivos).\n\n"
        "Se vários colegas do mesmo setor estiverem lentos ao mesmo tempo, abra um chamado de "
        "prioridade alta informando o setor afetado.",
        False,
    ),
    (
        "Acesso",
        "Senha expirada no ERP",
        "Troca de senha obrigatória no sistema ERP.",
        "O ERP exige troca de senha a cada 90 dias. A nova senha precisa ter 10 caracteres, "
        "letras maiúsculas e minúsculas, números e não pode repetir as últimas 5 senhas.\n\n"
        "Se a nova senha for recusada mesmo seguindo as regras, abra um chamado na categoria "
        "Acesso.",
        False,
    ),
    (
        "Acesso",
        "Solicitar acesso a pastas da rede",
        "Como pedir permissão para pastas compartilhadas.",
        "O acesso a pastas da rede precisa da aprovação do gestor da área dona da pasta. Abra "
        "um chamado na categoria Acesso informando o caminho da pasta, o tipo de acesso "
        "(leitura ou escrita) e o nome do gestor que vai aprovar.",
        False,
    ),
]
