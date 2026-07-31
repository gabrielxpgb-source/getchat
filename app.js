// Configuração do Supabase - Insira suas credenciais reais aqui
const SUPABASE_URL = 'https://sgnygzsbgqskcftfgncj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnbnlnenNiZ3Fza2NmdGZnbmNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDk3NjgsImV4cCI6MjEwMTA4NTc2OH0.oBAjEGtPZCeyjjz4aeSovvM-DKZzxIeIAHIHD79B6go';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variáveis de Estado
let usuarioAtual = '';
let subnickAtual = '';
let grupoAtual = '';
let conversaDestino = 'grupo'; // 'grupo' ou o nome de um usuário específico para chat privado
let usuariosOnline = {}; // Mapeia presença de usuários na sala

// Elementos da DOM
const telaLogin = document.getElementById('tela-login');
const telaChat = document.getElementById('tela-chat');
const inputUsuario = document.getElementById('input-usuario');
const inputSubnick = document.getElementById('input-subnick');
const inputGrupo = document.getElementById('input-grupo');
const btnEntrar = document.getElementById('btn-entrar');

const tituloSala = document.getElementById('titulo-sala');
const nomeUsuarioDisplay = document.getElementById('nome-usuario-display');
const subnickDisplay = document.getElementById('subnick-display');
const chatDestinoTitulo = document.getElementById('chat-destino-titulo');
const btnVoltarGrupo = document.getElementById('btn-voltar-grupo');
const msgsBox = document.getElementById('mensagens-container');
const listaUsuariosOnline = document.getElementById('lista-usuarios-online');

const inputMensagem = document.getElementById('input-mensagem');
const inputArquivo = document.getElementById('input-arquivo');
const btnAnexo = document.getElementById('btn-anexo');
const btnEnviar = document.getElementById('btn-enviar');
const btnNudge = document.getElementById('btn-nudge');
const chatContainer = document.getElementById('tela-chat');

// 1. Entrar na Sala
btnEntrar.addEventListener('click', async () => {
  usuarioAtual = inputUsuario.value.trim();
  subnickAtual = inputSubnick.value.trim() || 'Online';
  grupoAtual = inputGrupo.value.trim().toLowerCase();

  if (!usuarioAtual || !grupoAtual) {
    alert('Por favor, preencha seu nome e a sala!');
    return;
  }

  // Atualiza cabeçalhos
  nomeUsuarioDisplay.textContent = `@${usuarioAtual}`;
  subnickDisplay.textContent = subnickAtual ? `(${subnickAtual})` : '';
  tituloSala.textContent = `Sala: ${grupoAtual}`;

  // Alterna telas
  telaLogin.classList.add('esconde');
  telaChat.classList.remove('esconde');

  // Inicializa comunicação
  await carregarMensagens();
  configurarRealtimeEPRESENCE();
});

// 2. Sistema de Presença e Escuta em Tempo Real
function configurarRealtimeEPRESENCE() {
  const channel = _supabase.channel(`sala-${grupoAtual}`, {
    config: {
      presence: { key: usuarioAtual }
    }
  });

  // Escuta atualizações da lista de usuários online
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      usuariosOnline = {};
      
      Object.keys(state).forEach(key => {
        const info = state[key][0];
        if (info) {
          usuariosOnline[info.usuario] = info.subnick;
        }
      });

      renderizarListaContatos();
    })
    // Escuta novas mensagens no banco
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `grupo=eq.${grupoAtual}` }, payload => {
      const novaMsg = payload.new;
      
      // Efeito Chamar Atenção (Nudge)
      if (novaMsg.texto === '[NUDGE]') {
        executarTremeTreme();
      }

      // Só insere se for da conversa atual (Grupo ou Privado correspondente)
      if (deveExibirMensagem(novaMsg)) {
        exibirMensagem(novaMsg);
        msgsBox.scrollTop = msgsBox.scrollHeight;
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Envia estado de presença deste usuário para a sala
        await channel.track({
          usuario: usuarioAtual,
          subnick: subnickAtual,
          onlineAt: new Date().toISOString()
        });
      }
    });
}

// 3. Atualizar Lista Lateral de Contatos
function renderizarListaContatos() {
  listaUsuariosOnline.innerHTML = '';

  Object.keys(usuariosOnline).forEach(user => {
    if (user === usuarioAtual) return; // Não lista a si mesmo na barra lateral

    const sub = usuariosOnline[user] || 'Online';
    const div = document.createElement('div');
    div.className = `contato-item ${conversaDestino === user ? 'ativo' : ''}`;
    div.onclick = () => selecionarConversa(user);

    div.innerHTML = `
      <span class="status-dot online"></span>
      <div class="contato-info">
        <strong>${user}</strong>
        <small>${sub}</small>
      </div>
    `;

    listaUsuariosOnline.appendChild(div);
  });
}

// 4. Selecionar Conversa (Grupo ou Privado)
window.selecionarConversa = async function(destino) {
  conversaDestino = destino;

  // Atualizar destaques visuais nos contatos
  document.querySelectorAll('.contato-item').forEach(el => el.classList.remove('ativo'));
  if (destino === 'grupo') {
    document.getElementById('item-grupo-geral').classList.add('ativo');
    chatDestinoTitulo.textContent = '📢 Sala de Chat Geral';
    btnVoltarGrupo.classList.add('esconde');
  } else {
    chatDestinoTitulo.textContent = `🔒 Conversa Privada com @${destino}`;
    btnVoltarGrupo.classList.remove('esconde');
  }

  renderizarListaContatos();
  await carregarMensagens();
};

// Regra para verificar se a mensagem pertence ao chat visível no momento
function deveExibirMensagem(msg) {
  if (conversaDestino === 'grupo') {
    return !msg.destinatario; // Mensagem pública (sem destinatário específico)
  } else {
    // Mensagem privada entre o usuário atual e o destinatário selecionado
    return (msg.usuario === usuarioAtual && msg.destinatario === conversaDestino) ||
           (msg.usuario === conversaDestino && msg.destinatario === usuarioAtual);
  }
}

// 5. Carregar Mensagens
async function carregarMensagens() {
  const { data, error } = await _supabase
    .from('mensagens')
    .select('*')
    .eq('grupo', grupoAtual)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao carregar:', error);
    return;
  }

  msgsBox.innerHTML = '';
  data.filter(deveExibirMensagem).forEach(exibirMensagem);
  msgsBox.scrollTop = msgsBox.scrollHeight;
}

// 6. Desenhar Mensagem na Tela
function exibirMensagem(msg) {
  const div = document.createElement('div');
  const eMinha = msg.usuario === usuarioAtual;

  if (msg.texto === '[NUDGE]') {
    div.className = 'msg-item msg-nudge';
    div.textContent = eMinha ? '🔔 Você chamou a atenção de todos!' : `🔔 ${msg.usuario} acabou de chamar sua atenção!`;
  } else {
    div.className = `msg-item ${eMinha ? 'minha-msg' : ''}`;

    let conteudoMidia = '';
    if (msg.arquivo_url) {
      if (msg.arquivo_url.endsWith('.pdf')) {
        conteudoMidia = `<div class="msg-midia"><a href="${msg.arquivo_url}" target="_blank">📄 Ver arquivo PDF</a></div>`;
      } else {
        conteudoMidia = `<div class="msg-midia"><img src="${msg.arquivo_url}" alt="Foto enviada" style="max-width:100%; border-radius:4px; margin-top:5px;"></div>`;
      }
    }

    div.innerHTML = `
      <span class="msg-autor">${msg.usuario} ${msg.destinatario ? '🔒 (Privado)' : ''}</span>
      ${msg.texto ? `<span>${msg.texto}</span>` : ''}
      ${conteudoMidia}
    `;
  }

  msgsBox.appendChild(div);
}

// 7. Enviar Mensagem de Texto ou Arquivo
btnEnviar.addEventListener('click', enviarMensagem);
inputMensagem.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensagem(); });

async function enviarMensagem() {
  const texto = inputMensagem.value.trim();
  const arquivo = inputArquivo.files[0];

  if (!texto && !arquivo) return;

  let arquivoUrl = null;

  if (arquivo) {
    const nomeArquivo = `${Date.now()}_${arquivo.name}`;
    const { error: uploadErr } = await _supabase.storage.from('arquivos-chat').upload(nomeArquivo, arquivo);
    
    if (!uploadErr) {
      const { data: publicData } = _supabase.storage.from('arquivos-chat').getPublicUrl(nomeArquivo);
      arquivoUrl = publicData.publicUrl;
    }
  }

  const payload = {
    usuario: usuarioAtual,
    grupo: grupoAtual,
    texto: texto,
    arquivo_url: arquivoUrl,
    destinatario: conversaDestino === 'grupo' ? null : conversaDestino
  };

  await _supabase.from('mensagens').insert([payload]);

  inputMensagem.value = '';
  inputArquivo.value = '';
  btnAnexo.style.background = 'transparent';
}

// 8. Anexo
btnAnexo.addEventListener('click', () => inputArquivo.click());
inputArquivo.addEventListener('change', () => {
  if (inputArquivo.files.length > 0) btnAnexo.style.background = '#d3e3f7';
});

// 9. Botão "Chamar Atenção" (Nudge)
btnNudge.addEventListener('click', async () => {
  await _supabase.from('mensagens').insert([{
    usuario: usuarioAtual,
    grupo: grupoAtual,
    texto: '[NUDGE]',
    destinatario: conversaDestino === 'grupo' ? null : conversaDestino
  }]);
});

// Função para fazer a janela tremer
function executarTremeTreme() {
  chatContainer.classList.add('shake-animation');
  
  // Toca um bipe sonoro de atenção do navegador
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.log("Áudio bloqueado pelo navegador.");
  }

  setTimeout(() => {
    chatContainer.classList.remove('shake-animation');
  }, 500);
}