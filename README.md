# Français avec Vagnilds — Le Français

Aplicação web interativa de aprendizado de francês (trilha de 12 meses do A1 ao B2, vocabulário com pronúncia TTS, flashcards aleatórios, 4 jogos interativos, ranking de usuários, tema escuro e sincronização opcional com Google Drive).

## Como publicar no GitHub + Vercel

1. Crie um repositório novo no GitHub (ex.: `vagnilds-francais`).
2. Envie os arquivos deste pacote (`index.html`, `vercel.json`, `README.md`) para a raiz do repositório.
3. Acesse [vercel.com](https://vercel.com), clique em **Add New → Project** e importe o repositório do GitHub.
4. Mantenha as configurações padrão (**Framework Preset: Other**) e clique em **Deploy**.

## Sincronização com Google Drive (Opcional)

Se desejar ativar o login oficial com Google:
1. No [Google Cloud Console](https://console.cloud.google.com), ative a **Google Drive API**.
2. Crie um **ID do cliente OAuth 2.0 (Aplicativo da Web)** e adicione a URL do seu site na Vercel em **Origens JavaScript autorizadas**.
3. Cole o Client ID no modal **Entrar com o Google** dentro do app (ou na constante `DEFAULT_GOOGLE_CLIENT_ID` no `index.html`).
