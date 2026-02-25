// GridBlitz Extension Options

document.addEventListener('DOMContentLoaded', async () => {
  const { siteUrl, cronSecret } = await chrome.storage.sync.get(['siteUrl', 'cronSecret']);

  document.getElementById('site-url').value = siteUrl ?? '';
  document.getElementById('cron-secret').value = cronSecret ?? '';

  document.getElementById('btn-save').addEventListener('click', async () => {
    const newUrl = document.getElementById('site-url').value.trim();
    const newSecret = document.getElementById('cron-secret').value.trim();

    await chrome.storage.sync.set({
      siteUrl: newUrl,
      cronSecret: newSecret,
    });

    const msg = document.getElementById('saved-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
  });
});
