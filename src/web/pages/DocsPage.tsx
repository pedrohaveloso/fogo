export function DocsPage() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Documentações</h1>
      </div>
      <article className="panel docs" aria-labelledby="trackers-doc">
        <h2 id="trackers-doc">Rastreadores</h2>
        <p>
          Um rastreador é um aparelho com GPS, como um rastreador veicular, uma placa com módulo GPS
          ou um celular. Ligado a um equipamento ou a um agente, ele passa a informar a posição real
          no mapa da Central.
        </p>

        <h3>O que cada aparelho recebe</h3>
        <p>Ao criar uma tag, o FOGO mostra o que precisa ser gravado no aparelho:</p>
        <ul>
          <li>
            O ID da tag, como <code>TAG-7F3K9QWD</code>.
          </li>
          <li>O token, que funciona como a senha do aparelho.</li>
          <li>O endereço para onde o aparelho envia a posição.</li>
        </ul>
        <p>
          O token aparece uma única vez, logo depois de criar a tag. Copie antes de sair da página.
        </p>

        <h3>Como criar uma tag</h3>
        <ol>
          <li>
            Abra a ficha do equipamento (em Equipamentos, clique no número de série) ou a do agente
            (em Agentes, clique no nome).
          </li>
          <li>No quadro Rastreador, no fim da ficha, clique em Criar tag.</li>
          <li>
            Copie o token e o endereço e grave os dois no aparelho, junto com o ID. A configuração
            depende do modelo do aparelho; siga o manual dele.
          </li>
          <li>
            Ligue o aparelho. Quando a primeira posição chegar, o quadro mostra o horário em Última
            leitura e o marcador passa a se mover na Central.
          </li>
        </ol>
        <p>Cada equipamento ou agente aceita uma tag por vez.</p>

        <h3>O que muda no cadastro</h3>
        <ul>
          <li>
            Veículos, patinetes e outros equipamentos móveis: a posição e a bateria seguem o
            aparelho.
          </li>
          <li>
            Equipamentos fixos, como câmeras, radares e semáforos: o ponto continua sendo o do
            cadastro. A leitura mostra que o equipamento está vivo e atualiza a bateria e a última
            comunicação.
          </li>
          <li>Agentes: a posição segue o aparelho.</li>
        </ul>

        <h3>Com que frequência enviar</h3>
        <ul>
          <li>
            Equipamento fixo: ao menos uma leitura por minuto. Depois de 3 minutos sem leitura, ele
            aparece como sem comunicação.
          </li>
          <li>
            Veículo ou agente em movimento: uma leitura a cada 5 a 15 segundos deixa o mapa fluido.
            Parado, uma por minuto basta.
          </li>
          <li>
            O FOGO aceita até 60 leituras por minuto de cada tag. Acima disso, as leituras são
            recusadas até o minuto seguinte.
          </li>
        </ul>

        <h3>Trocar o aparelho ou trocar o token</h3>
        <p>
          Clique em Remover tag e crie outra. A tag antiga deixa de ser aceita na hora. Faça o mesmo
          se o token cair em mãos erradas ou se você não o copiou a tempo.
        </p>

        <h3>Se a posição não aparece</h3>
        <ul>
          <li>Confira se o ID, o token e o endereço foram gravados sem espaço sobrando.</li>
          <li>
            Se a Última leitura mostra nenhuma até agora, o aparelho ainda não conseguiu enviar.
            Verifique o sinal de internet e a bateria dele.
          </li>
          <li>
            Se a tag foi removida, o aparelho é recusado. Crie uma tag nova e grave os novos dados.
          </li>
          <li>
            Se o aparelho manda leituras demais, reduza a frequência para respeitar o limite por
            minuto.
          </li>
        </ul>

        <h3>Cuidados com o token</h3>
        <ul>
          <li>Não envie o token por mensagem ou e-mail.</li>
          <li>
            Use o endereço do FOGO que começa com https. Sem isso, qualquer pessoa na mesma rede
            consegue ler o token.
          </li>
          <li>
            Um token vazado só permite enviar posições daquela tag. Remova a tag e crie outra.
          </li>
        </ul>
      </article>
    </main>
  );
}
