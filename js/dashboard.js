document.addEventListener('DOMContentLoaded', () => {
  const uploadButton = document.getElementById('dashboard-upload');
  const fileInput = document.getElementById('videoInput');
  const inputVideo = document.getElementById('inputVideo');
  const outputVideo = document.getElementById('outputVideo');


  uploadButton.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    const videoURL = URL.createObjectURL(file);
    inputVideo.src = videoURL;
    inputVideo.load();
    inputVideo.play();
  }
});
});
