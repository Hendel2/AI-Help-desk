"""Artigos da base de conhecimento da empresa demo (§29, §92).

Cobrem os problemas mais comuns do dia a dia: sem IA configurada (ou se a cota do
provedor acabar), são a fonte das respostas do Assistente de TI; com IA, servem de
reforço à conversa.
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
        "Internet lenta, ruim, fraca ou caindo: diagnóstico rápido da conexão.",
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
    (
        "Hardware",
        "Mouse falhando ou com mau contato",
        "Cursor travando, cliques que falham ou mouse que desconecta sozinho.",
        "Para mouse que trava, falha no clique ou parece estar com mau contato:\n\n"
        "1. Mouse com fio: troque de porta USB, de preferência uma porta direto no computador "
        "(sem hub ou extensão).\n"
        "2. Mouse sem fio: troque as pilhas ou carregue a bateria e aproxime o receptor USB do "
        "mouse.\n"
        "3. Use um mousepad ou uma superfície fosca: vidro e superfícies brilhantes confundem o "
        "sensor.\n"
        "4. Limpe o sensor embaixo do mouse com um pano seco.\n"
        "5. Se tiver outro mouse, teste-o para saber se o defeito é do mouse ou do computador.\n\n"
        "Se outro mouse funciona normalmente, abra um chamado na categoria Hardware pedindo a "
        "troca.",
        False,
    ),
    (
        "Hardware",
        "Teclado não funciona ou com teclas falhando",
        "Teclado sem resposta, teclas que não digitam ou que digitam o caractere errado.",
        "1. Teclado com fio: troque de porta USB e reinicie o computador.\n"
        "2. Teclado sem fio: troque as pilhas e aproxime o receptor USB.\n"
        "3. Se acentos, ç ou símbolos saem trocados, confira o idioma do teclado na barra de "
        "tarefas: o padrão da empresa é Português (Brasil) ABNT2.\n"
        "4. Se os números do lado direito não funcionam, aperte a tecla Num Lock.\n\n"
        "Se caiu líquido no teclado, desconecte-o, vire-o de cabeça para baixo e não volte a "
        "usar: abra um chamado na categoria Hardware para a troca. Se foi no notebook, desligue o "
        "equipamento e abra o chamado com prioridade alta.",
        False,
    ),
    (
        "Hardware",
        "Monitor sem imagem ou tela preta",
        'Monitor que não liga, fica com a tela preta ou mostra "sem sinal".',
        "1. Confira se o monitor está ligado na tomada e se a luz do botão de energia acende.\n"
        "2. Verifique se o cabo de vídeo (HDMI, DisplayPort ou VGA) está bem encaixado nas duas "
        "pontas.\n"
        '3. Se aparecer "sem sinal", use o botão de entrada (Input ou Source) do monitor para '
        "escolher a entrada certa.\n"
        "4. Mexa o mouse ou aperte uma tecla: o computador pode estar em suspensão.\n"
        "5. Se tiver outro cabo ou monitor, teste-os para descobrir qual peça está com "
        "defeito.\n\n"
        "Se o monitor não liga de jeito nenhum ou continua sem sinal, abra um chamado na "
        "categoria Hardware.",
        False,
    ),
    (
        "Hardware",
        "Segundo monitor não é detectado",
        "Como usar dois monitores ou estender a área de trabalho.",
        "1. Confira se os dois monitores estão ligados e com o cabo de vídeo bem encaixado.\n"
        '2. Pressione as teclas Windows + P e escolha "Estender".\n'
        '3. Se ainda não aparecer, abra Configurações > Sistema > Tela e clique em "Detectar".\n'
        "4. Notebook com dock ou adaptador: desconecte e conecte o dock de novo e reinicie o "
        "computador com tudo conectado.\n\n"
        "Se o monitor continuar sem ser detectado, abra um chamado na categoria Hardware "
        "informando o modelo do dock ou adaptador que você usa.",
        False,
    ),
    (
        "Hardware",
        "Computador muito lento",
        "Computador travando ou demorando para abrir programas e arquivos.",
        "1. Reinicie o computador (Iniciar > Reiniciar). Fechar a tampa ou desligar só a tela não "
        "conta: o Windows precisa reiniciar de verdade, principalmente se fica dias ligado.\n"
        "2. Feche programas e abas do navegador que você não está usando.\n"
        "3. Abra o Gerenciador de Tarefas (Ctrl + Shift + Esc) e veja, na aba Processos, qual "
        "programa usa mais CPU ou memória.\n"
        '4. Confira se o disco não está cheio (veja o artigo "Pouco espaço em disco").\n'
        "5. Deixe as atualizações do Windows terminarem: enquanto rodam, o computador fica mais "
        "lento.\n\n"
        "Se a lentidão continuar depois de reiniciar, abra um chamado na categoria Hardware "
        "informando desde quando acontece e quais programas ficam lentos.",
        True,
    ),
    (
        "Hardware",
        "Computador ou notebook não liga",
        "Equipamento que não dá sinal de vida ao apertar o botão de energia.",
        "1. Confira se o cabo de energia está bem encaixado no computador e na tomada, e teste "
        "outra tomada.\n"
        "2. Se usar filtro de linha ou estabilizador, verifique se ele está ligado.\n"
        "3. Notebook: conecte o carregador e espere 15 minutos antes de tentar ligar, porque a "
        "bateria pode estar totalmente descarregada.\n"
        "4. Mantenha o botão de energia pressionado por 15 segundos, solte e ligue de novo.\n\n"
        "Não abra o gabinete nem o notebook. Se continuar sem ligar, abra um chamado na categoria "
        "Hardware, com prioridade alta se você não tiver outro equipamento para trabalhar.",
        False,
    ),
    (
        "Hardware",
        "Notebook não carrega ou bateria acaba rápido",
        "Bateria que não carrega, carregador que não funciona ou carga que dura pouco.",
        "1. Confira se o carregador está bem encaixado e se a luz de carga do notebook acende.\n"
        "2. Teste outra tomada e, se possível, outro carregador do mesmo modelo.\n"
        "3. Bateria que dura pouco: reduza o brilho da tela, feche programas que não está usando "
        "e ative o modo de economia de energia.\n"
        "4. Use sempre o carregador original: carregadores genéricos ou de celular podem não "
        "carregar ou danificar o equipamento.\n\n"
        "Se a bateria estiver estufada, o notebook esquentar demais ou o carregador tiver cheiro "
        "de queimado, desligue tudo da tomada e abra um chamado na categoria Hardware com "
        "prioridade alta.",
        False,
    ),
    (
        "Hardware",
        "Fone de ouvido ou microfone não funciona",
        "Sem som no fone, headset ou caixa de som, ou microfone que ninguém escuta.",
        "1. Confira se o fone está bem conectado. Headset USB: troque de porta. Bluetooth: "
        "desligue e ligue o Bluetooth e pareie de novo.\n"
        "2. Clique no ícone de som na barra de tarefas e escolha o dispositivo certo de saída "
        "(fone) e de entrada (microfone).\n"
        "3. Verifique se o volume não está no mudo e se o headset não tem um botão de mudo "
        "ligado.\n"
        "4. Em reuniões, confira também o dispositivo escolhido nas configurações de áudio do "
        "aplicativo (Teams, Meet ou Zoom).\n"
        "5. Reinicie o computador com o fone já conectado.\n\n"
        "Se o fone não funcionar em nenhum aplicativo nem em outra porta, abra um chamado na "
        "categoria Hardware.",
        False,
    ),
    (
        "Hardware",
        "Câmera não funciona nas reuniões",
        "Webcam com imagem preta, não detectada ou bloqueada no Teams, Meet ou Zoom.",
        "1. Veja se a câmera não tem uma tampa de privacidade fechada ou uma tecla de desligar a "
        "câmera no teclado do notebook.\n"
        "2. Feche outros programas que possam estar usando a câmera: só um aplicativo usa a "
        "câmera por vez.\n"
        "3. Em Configurações > Privacidade e segurança > Câmera, confira se o acesso à câmera "
        "está permitido.\n"
        "4. No navegador, clique no cadeado ao lado do endereço e permita a câmera para o site da "
        "reunião.\n"
        "5. Webcam USB: troque de porta e reinicie o computador.\n\n"
        "Se a câmera não aparecer em nenhum aplicativo, abra um chamado na categoria Hardware.",
        False,
    ),
    (
        "Hardware",
        "Computador travando ou tela azul",
        "Travamentos, reinícios sozinho ou tela azul com mensagem de erro.",
        "1. Fotografe ou anote a mensagem da tela azul: o código do erro ajuda muito a equipe.\n"
        "2. Reinicie o computador e veja se o problema volta.\n"
        "3. Lembre se algo mudou recentemente: programa instalado, atualização ou equipamento "
        "novo conectado. Desconecte o que for novo e teste.\n"
        "4. Enquanto o problema não é resolvido, salve o trabalho com frequência e mantenha os "
        "arquivos importantes no OneDrive ou na rede.\n\n"
        "Se a tela azul aparecer mais de uma vez, abra um chamado na categoria Hardware com a "
        "foto do erro e o horário em que aconteceu.",
        False,
    ),
    (
        "Hardware",
        "Pen drive ou dispositivo USB não é reconhecido",
        "Pendrive, HD externo ou outro aparelho USB que não aparece no computador.",
        "1. Troque de porta USB, de preferência uma direto no computador.\n"
        "2. Teste o dispositivo em outro computador para saber se ele está com defeito.\n"
        '3. Abra o Explorador de Arquivos e veja em "Este Computador" se o dispositivo aparece '
        "com outra letra.\n\n"
        "Por segurança, alguns computadores da empresa bloqueiam pen drives e HDs externos. Se "
        "aparecer uma mensagem de bloqueio, use o OneDrive ou uma pasta da rede para transferir "
        "os arquivos, ou abra um chamado na categoria Acesso explicando a necessidade: a "
        "liberação depende de aprovação do gestor.",
        False,
    ),
    (
        "Software",
        "Pouco espaço em disco",
        "Aviso de disco cheio ou disco C: quase sem espaço livre.",
        "1. Esvazie a Lixeira.\n"
        '2. Abra Configurações > Sistema > Armazenamento e use "Recomendações de limpeza" para '
        "apagar arquivos temporários.\n"
        "3. Revise a pasta Downloads: instaladores e arquivos antigos costumam ocupar muito "
        "espaço.\n"
        '4. Com o OneDrive, clique com o botão direito em pastas grandes e escolha "Liberar '
        'espaço": os arquivos continuam na nuvem e são baixados quando você abrir.\n\n'
        "Não apague nada das pastas do sistema (Windows, Arquivos de Programas). Se o disco "
        "continuar cheio, abra um chamado na categoria Software.",
        False,
    ),
    (
        "Software",
        "Windows Update travado ou pedindo para reiniciar",
        "Atualizações que não terminam, falham ou ficam pedindo reinicialização.",
        "1. Salve o que estiver aberto e reinicie o computador: muitas atualizações só terminam "
        "no reinício.\n"
        '2. Se a tela mostrar "Trabalhando nas atualizações", não desligue o computador, mesmo '
        "que demore: desligar no meio pode corromper o sistema.\n"
        "3. Notebook: deixe o carregador conectado durante a atualização.\n"
        '4. Em Configurações > Windows Update, clique em "Verificar se há atualizações" e deixe '
        "instalar.\n\n"
        "Se a mesma atualização falhar várias vezes ou a tela de atualização ficar parada por "
        "mais de 2 horas, abra um chamado na categoria Software.",
        False,
    ),
    (
        "Software",
        "Programa travado ou não respondendo",
        'Aplicativo congelado ou com a mensagem "Não está respondendo".',
        "1. Espere um ou dois minutos: programas abrindo arquivos grandes podem demorar.\n"
        "2. Abra o Gerenciador de Tarefas (Ctrl + Shift + Esc), selecione o programa e clique em "
        '"Finalizar tarefa". Atenção: o que não foi salvo pode ser perdido.\n'
        "3. Abra o programa de novo. O Office (Word, Excel, PowerPoint) costuma oferecer a "
        "recuperação do documento.\n"
        "4. Se travar sempre, reinicie o computador.\n\n"
        "Se o programa continuar travando, abra um chamado na categoria Software informando o "
        "nome do programa e o que você estava fazendo quando ele travou.",
        False,
    ),
    (
        "Software",
        "Como instalar um programa",
        "Instalação de software no computador da empresa.",
        "Por segurança, os computadores da empresa não permitem instalar programas por conta "
        "própria.\n\n"
        "1. Procure o programa na Central de Software (portal de software): os programas "
        "liberados podem ser instalados por lá, sem senha de administrador.\n"
        "2. Se o programa não estiver no portal, abra um chamado na categoria Software informando "
        "o nome do programa, para que você precisa dele e o site oficial do fabricante. A "
        "instalação pode depender de aprovação do gestor e de licença.\n\n"
        'Não baixe programas de sites desconhecidos nem use versões "crackeadas": elas são a '
        "principal porta de entrada de vírus.",
        False,
    ),
    (
        "Software",
        "Excel ou Word travando, fechando ou arquivo não abre",
        "Excel ou Word que travou ou fechou sozinho, planilha ou documento perdido sem "
        "salvar, ou arquivo corrompido.",
        '1. Abra o programa de novo e, no painel "Recuperação de documentos", à esquerda, abra '
        "a versão recuperada.\n"
        "2. Documento fechado sem salvar: em Arquivo > Informações > Gerenciar documento, use "
        '"Recuperar documentos não salvos".\n'
        "3. Arquivo que não abre: em Arquivo > Abrir, selecione o arquivo, clique na seta do "
        'botão Abrir e escolha "Abrir e reparar".\n'
        '4. Arquivo no OneDrive ou no SharePoint: use o "Histórico de versões" para voltar a '
        "uma versão anterior.\n\n"
        "Se nenhuma opção recuperar o arquivo, abra um chamado na categoria Software informando o "
        "nome e a pasta do arquivo.",
        False,
    ),
    (
        "Software",
        "Navegador lento ou páginas não carregam",
        "Chrome ou Edge lento, páginas em branco ou erro ao abrir sites.",
        "1. Feche as abas que você não está usando.\n"
        "2. Atualize o navegador: menu > Ajuda > Sobre.\n"
        '3. Limpe o cache e os cookies (Ctrl + Shift + Delete, período "Todo o período"). Você '
        "precisará entrar de novo nos sites.\n"
        "4. Desative extensões que você não reconhece.\n"
        "5. Teste o mesmo site em outro navegador ou em uma janela anônima.\n\n"
        'Se só um sistema da empresa não abre, veja o artigo "Site ou sistema interno não '
        'abre". Se todos os sites estão lentos, o problema pode ser a conexão: veja os '
        "artigos da categoria Rede.",
        False,
    ),
    (
        "Software",
        "Teams sem som, sem vídeo ou travando na reunião",
        "Reunião sem áudio, microfone mudo, vídeo travando ou Teams lento.",
        "1. Antes de entrar na reunião, escolha o fone, o microfone e a câmera certos na tela de "
        "entrada.\n"
        "2. Durante a reunião, clique em Mais > Configurações > Configurações do dispositivo para "
        "trocar o dispositivo.\n"
        "3. Áudio ou vídeo travando: desligue a câmera e pause downloads e outras chamadas, "
        "porque a conexão pode estar fraca.\n"
        "4. Teams lento ou com erro: saia do Teams (botão direito no ícone perto do relógio > "
        "Sair) e abra de novo.\n"
        '5. Faça uma chamada de teste em Configurações > Dispositivos > "Fazer uma chamada de '
        'teste".\n\n'
        "Se o problema acontecer em todas as reuniões, abra um chamado na categoria Software.",
        False,
    ),
    (
        "Software",
        "OneDrive não sincroniza",
        "Arquivos com ícone de erro, sincronização pausada ou parada.",
        "1. Clique no ícone de nuvem do OneDrive, perto do relógio, e leia a mensagem de status.\n"
        '2. Se estiver pausado, clique em "Retomar sincronização".\n'
        "3. Confira se você entrou com a conta da empresa e se ainda há espaço disponível no "
        "OneDrive.\n"
        '4. Arquivos com nome muito longo ou com caracteres como " * : < > ? / \\ | não '
        "sincronizam: renomeie-os.\n"
        "5. Feche o OneDrive (ícone > engrenagem > Sair do OneDrive) e abra de novo pelo menu "
        "Iniciar.\n\n"
        "Se aparecer conflito de arquivos ou a sincronização continuar parada, abra um chamado na "
        "categoria Software. Não apague a pasta do OneDrive do computador.",
        False,
    ),
    (
        "Software",
        "Recuperar arquivo apagado por engano",
        "Apagou um arquivo sem querer? Como recuperar arquivos excluídos ou voltar a uma "
        "versão anterior.",
        "1. Procure na Lixeira do computador: clique com o botão direito no arquivo e escolha "
        '"Restaurar".\n'
        "2. Arquivos do OneDrive ou do SharePoint: abra o OneDrive no navegador e veja a Lixeira "
        "dele, onde os arquivos excluídos ficam por 93 dias.\n"
        "3. Arquivo alterado ou substituído por engano: no OneDrive ou no SharePoint, clique com "
        'o botão direito no arquivo e use "Histórico de versões".\n'
        '4. Pastas da rede: clique com o botão direito na pasta e veja a aba "Versões '
        'anteriores".\n\n'
        "Se não encontrar o arquivo, abra um chamado na categoria Software o quanto antes, com o "
        "nome do arquivo, a pasta e a data aproximada em que ele foi apagado: os backups têm "
        "prazo de retenção.",
        True,
    ),
    (
        "Software",
        "Alerta de vírus ou arquivo bloqueado pelo antivírus",
        "O que fazer quando o antivírus mostra um alerta ou coloca um arquivo em quarentena.",
        "1. Não desative o antivírus e não tente restaurar o arquivo da quarentena por conta "
        "própria.\n"
        "2. Anote o nome do arquivo e a mensagem do alerta (uma foto da tela serve).\n"
        "3. Se o alerta apareceu depois de abrir um anexo ou link de e-mail, desconecte o "
        "computador da rede (tire o cabo ou desligue o Wi-Fi) e não digite senhas.\n"
        "4. Abra um chamado na categoria Software com prioridade alta, descrevendo o que você "
        "estava fazendo.\n\n"
        "Se o arquivo bloqueado for de trabalho e de origem confiável, a equipe de TI analisa e "
        "libera com segurança.",
        False,
    ),
    (
        "Software",
        "Como tirar print da tela",
        "Capturar a tela para mostrar um erro no chamado.",
        "1. Pressione Windows + Shift + S e selecione a área da tela que deseja capturar.\n"
        "2. A imagem fica copiada: cole com Ctrl + V no e-mail ou no Teams.\n"
        "3. Para salvar como arquivo, clique na notificação que aparece no canto da tela e use o "
        "botão de salvar. Depois, anexe o arquivo ao chamado.\n\n"
        "Um print da mensagem de erro ajuda a equipe de TI a resolver o chamado mais rápido. "
        "Antes de enviar, confira se a imagem não mostra senhas ou dados sensíveis.",
        False,
    ),
    (
        "Rede",
        "Wi-Fi não conecta ou está sem internet",
        'Rede wifi que não aparece, recusa a senha ou mostra "sem internet".',
        "1. Desligue e ligue o Wi-Fi do computador pelo ícone de rede na barra de tarefas (ou "
        "ative e desative o modo avião).\n"
        "2. Conecte-se à rede da empresa EMPRESA-5G: a rede de visitantes tem acesso limitado.\n"
        '3. Se a rede recusar a senha, clique com o botão direito nela, escolha "Esquecer" e '
        "conecte de novo.\n"
        "4. Reinicie o computador.\n"
        "5. Veja se colegas próximos também estão sem conexão: se estiverem, o problema é na "
        "rede, não no seu computador.\n\n"
        "Se vários colegas estiverem sem Wi-Fi, abra um chamado na categoria Rede com prioridade "
        "alta informando o andar ou a sala.",
        True,
    ),
    (
        "Rede",
        "Cabo de rede desconectado",
        "Computador na mesa sem rede, com o aviso de cabo de rede desconectado.",
        "1. Confira se o cabo de rede está bem encaixado no computador (ou no dock) e no ponto de "
        "rede da parede ou da mesa: ele deve fazer um clique.\n"
        "2. Veja se a luz da porta de rede do computador acende ou pisca.\n"
        "3. Teste outro cabo ou outro ponto de rede, se houver.\n"
        "4. Enquanto isso, conecte-se ao Wi-Fi EMPRESA-5G para continuar trabalhando.\n\n"
        "Se o ponto de rede não funcionar com nenhum cabo, abra um chamado na categoria Rede "
        "informando a sala e o número do ponto (etiqueta na tomada de rede).",
        False,
    ),
    (
        "Rede",
        "Site ou sistema interno não abre",
        'Mensagem "Não é possível acessar esse site" ao abrir sistemas da empresa.',
        "1. Confira se o endereço está correto e abra um site externo para testar a internet.\n"
        "2. Fora do escritório, os sistemas internos só abrem com a VPN conectada.\n"
        "3. Teste em outro navegador ou em uma janela anônima.\n"
        "4. Pergunte a um colega se o sistema abre para ele.\n\n"
        "Se o sistema não abre para ninguém, abra um chamado na categoria Sistema com prioridade "
        "alta, informando o endereço e a mensagem de erro (um print ajuda).",
        False,
    ),
    (
        "Rede",
        "Unidade de rede desconectada ou pasta sumiu",
        "Unidade de rede (como Z:) com X vermelho ou pasta compartilhada que não aparece.",
        "1. Fora do escritório, conecte a VPN: as unidades de rede só funcionam dentro da rede da "
        "empresa.\n"
        "2. Dê um duplo clique na unidade com X vermelho: muitas vezes ela reconecta sozinha.\n"
        "3. Reinicie o computador já conectado à rede da empresa.\n"
        "4. Se uma pasta sumiu de dentro da unidade, pergunte a um colega do setor se ela foi "
        "movida ou renomeada.\n\n"
        "Se a unidade continuar desconectada, abra um chamado na categoria Rede informando a "
        "letra da unidade e o caminho da pasta.",
        False,
    ),
    (
        "E-mail",
        "Outlook não abre ou não sincroniza",
        "Outlook travando ao abrir, desconectado ou sem receber e-mails novos.",
        '1. Olhe a barra inferior do Outlook: se aparecer "Trabalhando offline", vá em '
        'Enviar/Receber e desative "Trabalhar Offline".\n'
        "2. Feche o Outlook, confira no Gerenciador de Tarefas (Ctrl + Shift + Esc) se ele fechou "
        "de verdade e abra de novo.\n"
        "3. Teste o Outlook na Web pelo navegador: se lá os e-mails chegam, o problema é só no "
        "computador.\n"
        "4. Se o Outlook travar ao abrir, abra-o em modo de segurança: tecla Windows + R, digite "
        "outlook.exe /safe e pressione Enter.\n"
        "5. Reinicie o computador.\n\n"
        "Se continuar sem sincronizar, abra um chamado na categoria E-mail. Enquanto isso, use o "
        "Outlook na Web.",
        True,
    ),
    (
        "E-mail",
        "Caixa de e-mail cheia",
        "Aviso de caixa de correio cheia ou e-mails que não podem ser enviados.",
        "1. Esvazie as pastas Itens Excluídos e Lixo Eletrônico.\n"
        "2. Ordene a caixa de entrada por tamanho e apague (ou salve no OneDrive) os e-mails com "
        "anexos grandes.\n"
        "3. Revise a pasta Itens Enviados: ela também ocupa espaço.\n"
        "4. Se o Arquivo Morto online estiver disponível, mova para lá os e-mails antigos.\n\n"
        "Se mesmo assim a caixa continuar cheia, abra um chamado na categoria E-mail para avaliar "
        "o aumento do espaço.",
        False,
    ),
    (
        "E-mail",
        "E-mail suspeito ou golpe (phishing)",
        "E-mail estranho ou falso pedindo senha, código ou clique em link: como reconhecer o "
        "golpe e o que fazer.",
        'Sinais de golpe: remetente estranho ou parecido com um conhecido, urgência ("sua conta '
        'será bloqueada hoje"), pedido de senha ou código, links que levam a endereços '
        "diferentes do esperado e anexos inesperados.\n\n"
        "1. Não clique em links, não abra anexos e não responda.\n"
        '2. Use o botão "Relatar" do Outlook, se estiver disponível, e depois apague a '
        "mensagem.\n"
        "3. Lembre-se: a equipe de TI nunca pede a sua senha por e-mail, chat ou telefone.\n\n"
        "Se você já clicou no link ou digitou a sua senha, troque a senha imediatamente no portal "
        "de senhas e abra um chamado na categoria E-mail com prioridade alta.",
        True,
    ),
    (
        "E-mail",
        "Resposta automática de férias",
        "Como ativar a mensagem automática de ausência no Outlook.",
        "1. No Outlook, vá em Arquivo > Respostas Automáticas (no Outlook novo ou na Web: "
        "Configurações > Contas > Respostas automáticas).\n"
        '2. Ative "Enviar respostas automáticas" e defina a data de início e de fim.\n'
        "3. Escreva a mensagem para pessoas de dentro da empresa e, na outra aba, para pessoas de "
        "fora.\n"
        "4. Informe na mensagem a data de retorno e um contato alternativo.\n\n"
        "Se outra pessoa precisar acessar a sua caixa durante a ausência, o seu gestor deve abrir "
        "um chamado na categoria Acesso.",
        False,
    ),
    (
        "E-mail",
        "Assinatura de e-mail",
        "Como criar ou atualizar a assinatura no Outlook.",
        "1. No Outlook, vá em Arquivo > Opções > Email > Assinaturas (no Outlook novo ou na Web: "
        "Configurações > Contas > Assinaturas).\n"
        "2. Clique em Novo, dê um nome e cole o modelo oficial de assinatura disponível na "
        "intranet.\n"
        "3. Escolha a assinatura padrão para novas mensagens e para respostas.\n\n"
        "Use apenas o modelo oficial: imagens copiadas da internet podem ser bloqueadas pelos "
        "filtros de outros servidores.",
        False,
    ),
    (
        "Acesso",
        "Esqueci minha senha ou minha conta está bloqueada",
        "Senha de rede (Windows) esquecida ou conta bloqueada depois de várias tentativas.",
        "1. A conta é bloqueada por 30 minutos depois de 5 tentativas erradas. Espere esse tempo "
        "antes de tentar de novo.\n"
        '2. Use a opção "Esqueci minha senha" no portal de senhas para criar uma nova senha com '
        "a verificação pelo celular cadastrado.\n"
        "3. Depois da troca, atualize a senha também no celular (e-mail e Teams) e na VPN: senão "
        "eles continuam tentando a senha antiga e bloqueiam a conta de novo.\n\n"
        "Sem acesso ao celular cadastrado, abra um chamado na categoria Acesso (de outro "
        "computador ou pelo celular). A equipe confirma a sua identidade e nunca pede a sua senha.",
        True,
    ),
    (
        "Acesso",
        "Código de verificação (MFA) não chega ou troquei de celular",
        "Problemas com o aplicativo autenticador, o SMS de verificação ou um celular novo.",
        "1. Confira se a data e a hora do celular estão no automático: o código do aplicativo "
        "autenticador depende do horário certo.\n"
        "2. Se o SMS não chega, espere um minuto, confira se o celular tem sinal e peça de novo.\n"
        '3. Na tela de login, use "Entrar de outra forma" para escolher outro método '
        "cadastrado.\n"
        "4. Trocou de celular? Se ainda tiver o antigo, cadastre o novo aparelho no portal de "
        "segurança da conta antes de apagar o antigo.\n\n"
        "Sem nenhum método disponível, abra um chamado na categoria Acesso para redefinir a "
        "verificação. Nunca aprove uma notificação de login que você não pediu: pode ser alguém "
        "tentando entrar na sua conta.",
        False,
    ),
    (
        "Acesso",
        "Acessos para novo colaborador",
        "Como pedir conta de rede, e-mail e sistemas para um novo funcionário.",
        "O gestor deve abrir um chamado na categoria Acesso com pelo menos 3 dias úteis de "
        "antecedência, informando:\n\n"
        "1. Nome completo, cargo, departamento e data de início.\n"
        "2. Sistemas e pastas que a pessoa vai usar (ERP, pastas da rede, grupos de e-mail).\n"
        "3. Equipamentos necessários (notebook, monitor, headset).\n\n"
        "A conta de rede, o e-mail e os acessos ficam prontos até a data de início. A senha "
        "inicial é entregue pessoalmente e deve ser trocada no primeiro acesso.",
        False,
    ),
    (
        "Acesso",
        "Computador pede senha de administrador",
        "Janela pedindo usuário e senha de administrador ao instalar ou alterar algo.",
        "Essa janela aparece quando um programa tenta instalar algo ou alterar configurações "
        "protegidas. Por segurança, as contas de usuário não têm permissão de administrador.\n\n"
        '1. Clique em "Não" ou feche a janela.\n'
        '2. Para instalar programas, use a Central de Software (veja o artigo "Como instalar um '
        'programa").\n'
        "3. Se a janela aparecer sozinha, sem você ter pedido nada, anote o nome do programa que "
        "aparece nela.\n\n"
        "Abra um chamado na categoria Software informando o que você estava tentando fazer. Nunca "
        "peça a senha de administrador a colegas.",
        False,
    ),
    (
        "Impressora",
        "Impressora não imprime",
        "Documento parado na fila, impressora offline ou nada sai na impressão.",
        "1. Confira se a impressora está ligada, com papel e sem mensagem de erro no visor.\n"
        "2. No computador, abra Configurações > Bluetooth e dispositivos > Impressoras e "
        'scanners, clique na impressora e em "Abrir fila de impressão". Cancele os documentos '
        "parados e imprima de novo.\n"
        '3. Se a impressora aparecer como "Offline", desligue-a, espere 30 segundos e ligue de '
        "novo.\n"
        "4. Confira se você escolheu a impressora certa na hora de imprimir.\n"
        "5. Reinicie o computador.\n\n"
        "Se ninguém consegue imprimir nessa impressora, abra um chamado na categoria Impressora "
        "informando o nome ou o local dela.",
        True,
    ),
    (
        "Impressora",
        "Impressão falhada, clara ou manchada",
        "Folhas com falhas, listras, manchas ou impressão muito clara (toner fraco).",
        "1. Veja no visor da impressora o nível do toner ou da tinta.\n"
        "2. Toner fraco: retire o cartucho, balance-o suavemente de um lado para o outro e "
        "recoloque. Isso costuma render mais algumas páginas.\n"
        "3. Listras ou manchas sempre no mesmo lugar podem ser sujeira no cilindro: não tente "
        "limpar a parte interna.\n"
        "4. Confira se o papel não está úmido ou amassado.\n\n"
        "Para trocar o toner ou se a impressão continuar ruim, abra um chamado na categoria "
        "Impressora informando o nome da impressora e, se possível, anexando a foto de uma folha.",
        False,
    ),
    (
        "Impressora",
        "Adicionar impressora no computador",
        "Como instalar uma impressora da rede no seu computador.",
        "1. Abra Configurações > Bluetooth e dispositivos > Impressoras e scanners.\n"
        '2. Clique em "Adicionar dispositivo" e aguarde a lista de impressoras da rede.\n'
        "3. Escolha a impressora pelo nome, que fica na etiqueta da própria impressora (por "
        'exemplo, IMP-FIN-01), e clique em "Adicionar".\n'
        '4. Se ela não aparecer, clique em "Adicionar manualmente" e informe o caminho '
        "\\\\servidor-impressao\\NOME-DA-IMPRESSORA.\n\n"
        "Se o computador pedir senha de administrador ou driver, abra um chamado na categoria "
        "Impressora.",
        False,
    ),
    (
        "Impressora",
        "Scanner não envia para o e-mail ou para a pasta",
        "Digitalização que não chega no e-mail ou na pasta da rede.",
        "1. Confira se você digitou o e-mail completo e correto no painel da impressora.\n"
        "2. Veja a pasta Lixo Eletrônico: digitalizações às vezes vão para lá.\n"
        "3. Arquivos muito grandes podem não ser enviados: digitalize em resolução menor (200 "
        "dpi) ou com menos páginas por vez.\n"
        "4. Para pastas da rede, confira se você tem acesso à pasta de destino.\n\n"
        "Se o scanner mostrar erro de envio para todas as pessoas, abra um chamado na categoria "
        "Impressora com a mensagem de erro do visor.",
        False,
    ),
    (
        "Sistema",
        "ERP lento ou fora do ar",
        "Sistema ERP sem resposta, muito lento ou com erro ao entrar.",
        "1. Confira a página de status dos sistemas: se houver um incidente em andamento, a "
        "equipe já está trabalhando nele.\n"
        "2. Saia do ERP, feche o navegador e entre de novo.\n"
        "3. Se o erro acontece só com você, limpe o cache do navegador (Ctrl + Shift + Delete).\n"
        "4. Fora do escritório, confira se a VPN está conectada.\n"
        "5. Pergunte a um colega se o ERP está lento para ele também.\n\n"
        "Se o ERP estiver fora do ar para várias pessoas, abra um chamado na categoria Sistema "
        "com prioridade alta informando o horário e a mensagem de erro.",
        False,
    ),
    (
        "Sistema",
        "Sem permissão ou tela faltando no sistema",
        'Mensagem de "acesso negado" ou menu que não aparece em um sistema da empresa.',
        'Mensagens como "acesso negado" ou "usuário sem permissão", ou um menu que sumiu, '
        "indicam que o seu perfil no sistema não tem aquela permissão.\n\n"
        "1. Saia do sistema e entre de novo: mudanças de permissão só valem depois de um novo "
        "login.\n"
        "2. Confirme com o seu gestor se você deveria ter esse acesso.\n\n"
        "Abra um chamado na categoria Acesso informando o sistema, a tela ou função de que você "
        "precisa e o nome do gestor que aprova o acesso.",
        False,
    ),
    (
        "Sistema",
        "Sessão expirada ou erro ao salvar no sistema",
        "Sistema que desconecta sozinho ou perde o que foi digitado ao salvar.",
        "1. Por segurança, os sistemas encerram a sessão depois de um tempo sem uso: salve o "
        "trabalho com frequência.\n"
        "2. Se aparecer erro ao salvar, copie o que você digitou para um bloco de notas antes de "
        "tentar de novo.\n"
        "3. Use apenas uma aba do sistema por vez: abas duplicadas podem encerrar a sessão.\n"
        "4. Limpe o cache do navegador (Ctrl + Shift + Delete) e entre de novo.\n\n"
        "Se o erro ao salvar continuar, abra um chamado na categoria Sistema com um print da "
        "mensagem e o horário.",
        False,
    ),
    (
        "VPN",
        "VPN conectada, mas os sistemas internos não abrem",
        "VPN conectada, porém pastas da rede e sistemas da empresa não carregam.",
        "1. Desconecte e conecte a VPN de novo.\n"
        "2. Abra um site externo para confirmar que a sua internet está funcionando.\n"
        "3. Acesse pastas e sistemas pelo endereço completo, e não por atalhos antigos.\n"
        "4. Reinicie o computador e conecte a VPN antes de abrir os sistemas.\n\n"
        "Se nenhum sistema interno abrir com a VPN conectada, abra um chamado na categoria VPN "
        "informando o horário e quais sistemas você tentou acessar.",
        False,
    ),
    (
        "VPN",
        "Como instalar e configurar a VPN",
        "Primeiro acesso à VPN para trabalhar fora do escritório.",
        "1. Instale o cliente VPN pela Central de Software (portal de software).\n"
        "2. Abra o cliente e informe o endereço do servidor publicado na intranet.\n"
        "3. Entre com o mesmo usuário e senha da rede e confirme o login no aplicativo "
        "autenticador.\n"
        "4. Com a VPN conectada, os sistemas internos e as pastas da rede ficam disponíveis.\n\n"
        'O acesso à VPN depende de liberação: se aparecer "usuário sem permissão", peça ao seu '
        "gestor para abrir um chamado na categoria VPN.",
        False,
    ),
]
