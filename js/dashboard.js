document.addEventListener('DOMContentLoaded', () => {
  const uploadButton = document.getElementById('dashboard-upload');
  const fileInput = document.getElementById('videoInput');
  const inputVideo = document.getElementById('inputVideo');
  const outputVideo = document.getElementById('outputVideo');
  let selectedFile = null;

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

document.getElementById('dashboard-play').addEventListener('click', async () => {
  const file = document.getElementById('videoInput').files[0];
  if (!file) {
    alert('파일을 선택해주세요');
    return;
  }

  const formData = new FormData();
  formData.append('video', file);

  try {
    const response = await fetch('http://127.0.0.1:8000/nova/dashboard/video/upload/', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    console.log(result);
    alert(result.message);
  } catch (err) {
    console.error(err);
    // 왜 자꾸 서버에 잘 올라가는데 업로드 실패가 뜨는지..? 모르겠음 추후 수정 예정
    // alert('업로드 실패'); 
  }
});
