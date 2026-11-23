export function mountArrivalFilm(video, settle, fallback, start) {
  let playing = false;
  let generation = 0;
  let animation = 0;
  let timeout = 0;
  let currentPortrait;

  function finish() {
    if (!playing) return;
    playing = false;
    generation++;
    clearTimeout(timeout);
    video.pause();
    settle();
    animation = requestAnimationFrame(() => {
      video.classList.remove('is-playing');
    });
  }

  async function play(portrait) {
    cancelAnimationFrame(animation);
    clearTimeout(timeout);
    const attempt = ++generation;
    playing = true;
    start();
    if (portrait !== currentPortrait) {
      currentPortrait = portrait;
      video.src = portrait
        ? new URL('./assets/arrival-portrait.mp4', import.meta.url).href
        : new URL('./assets/arrival-landscape.mp4', import.meta.url).href;
    }
    video.currentTime = 0;
    video.classList.remove('is-playing');
    const fail = () => {
      if (attempt !== generation) return;
      playing = false;
      generation++;
      clearTimeout(timeout);
      video.pause();
      video.classList.remove('is-playing');
      fallback();
    };
    timeout = setTimeout(fail, 3200);
    try {
      await video.play();
      if (attempt !== generation) return;
      clearTimeout(timeout);
      video.classList.add('is-playing');
      timeout = setTimeout(finish, 9500);
    } catch {
      fail();
    }
  }

  video.addEventListener('ended', finish);
  return { play, finish, get active() { return playing; } };
}
