import { ChangeDetectionStrategy, Component, computed, signal, OnDestroy, OnInit, inject, HostListener, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SettingsModal } from './settings-modal';
import { GuideModal } from './guide-modal';
import { DeviceDetector } from './device-detector';
import { SettingsService } from './settings.service';
import { RecordingService } from './recording.service';
import { DraggableCameraDirective } from './draggable-camera.directive';
import { ToastService } from './toast.service';
import { APP_CONFIG } from './constants';
import { FooterComponent } from './footer.component';
import { CountdownOverlayComponent } from './countdown-overlay.component';
import { LanguageService } from './language.service';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    SettingsModal, 
    GuideModal, 
    MatIconModule, 
    DraggableCameraDirective,
    FooterComponent,
    CountdownOverlayComponent,
    CommonModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(window:keydown)': 'handleKeydown($event)',
    '(window:resize)': 'updateCachedWindowSize()'
  }
})
export class App implements OnDestroy, OnInit {
  private deviceDetector = inject(DeviceDetector);
  private settingsService = inject(SettingsService);
  private recordingService = inject(RecordingService);
  public toastService = inject(ToastService);
  public lang = inject(LanguageService);

  isCameraEnabled = signal(false);
  cameraStream = signal<MediaStream | null>(null);
  cameraPos = signal({ x: APP_CONFIG.CONSTRAINTS.CAMERA_EDGE_PADDING, y: 0 });
  isDraggingCam = signal(false);

  // ScreenPal size settings (defaults to 1248 x 702 or URL params)
  frameWidth = signal(1248);
  frameHeight = signal(702);
  private defaultWidth = 1248;
  private defaultHeight = 702;

  // ScreenPal camera PIP positioning grid state
  showPipGrid = signal(false);

  // ScreenPal drawing state
  isDrawingMode = signal(false);
  currentDrawColor = signal('#ef4444');
  currentBrushSize = signal(6);
  currentDrawTool = signal<'pencil' | 'eraser'>('pencil');

  // ScreenPal zoom state
  isZoomMode = signal(false);
  zoomScale = signal(1.0);
  zoomCenter = signal({ x: 0.5, y: 0.5 });

  drawingColors = [
    '#000000', // Black
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#22c55e', // Green
    '#f97316', // Orange
    '#a855f7', // Purple
    '#06b6d4', // Cyan
    '#ffffff', // White
    '#eab308', // Yellow
    '#d946ef', // Magenta
    '#60a5fa', // Light Blue
    '#6b7280'  // Grey
  ];

  presetPositions = [
    { name: 'top-left', label: 'Top Left' },
    { name: 'top-center', label: 'Top Center' },
    { name: 'top-right', label: 'Top Right' },
    { name: 'middle-left', label: 'Mid Left' },
    { name: 'middle-center', label: 'Center' },
    { name: 'middle-right', label: 'Mid Right' },
    { name: 'bottom-left', label: 'Bottom Left' },
    { name: 'bottom-center', label: 'Bottom Center' },
    { name: 'bottom-right', label: 'Bottom Right' }
  ];

  cachedWindowWidth = APP_CONFIG.CONSTRAINTS.MAX_RESOLUTION;
  cachedWindowHeight = 1080;
  
  isRecording = this.recordingService.isRecording;
  isMuted = this.recordingService.isMuted;
  screenShareStream = this.recordingService.screenShareStream;
  isCountingDown = this.recordingService.isCountingDown;
  countdownValue = this.recordingService.countdownValue;
  recordingTime = this.recordingService.recordingTime;
  errorMessage = this.recordingService.errorMessage;
  showSuccessToast = this.toastService.show;
  successMessage = this.toastService.message;
  showGuideModal = signal(false);
  audioLevels = this.recordingService.audioLevels;
  
  qualityPreset = this.settingsService.qualityPreset;
  tempQualityPreset = this.settingsService.tempQualityPreset;
  cameraSize = this.settingsService.cameraSize;
  tempCameraSize = this.settingsService.tempCameraSize;
  uiMode = this.settingsService.uiMode;
  tempUiMode = this.settingsService.tempUiMode;
  fpsPreset = this.settingsService.fpsPreset;
  tempFpsPreset = this.settingsService.tempFpsPreset;
  showBorder = this.settingsService.showBorder;
  tempShowBorder = this.settingsService.tempShowBorder;
  borderColor = this.settingsService.borderColor;
  tempBorderColor = this.settingsService.tempBorderColor;
  tempLanguage = this.settingsService.tempLanguage;
  cameraShape = this.settingsService.cameraShape;
  tempCameraShape = this.settingsService.tempCameraShape;
  showSettingsModal = signal(false);

  hasMicDevice = this.deviceDetector.hasMicDevice;
  micPermission = this.deviceDetector.micPermission;
  hasCameraDevice = this.deviceDetector.hasCameraDevice;
  cameraPermission = this.deviceDetector.cameraPermission;
  cameraError = signal<string | null>(null);
  recordingAttempted = this.recordingService.recordingAttempted;
  
  version = APP_CONFIG.VERSION;

  constructor() {
    // Auto-sync our local UI states to RecordingService's composite signals in real-time
    effect(() => {
      this.recordingService.isCameraEnabled.set(this.isCameraEnabled());
    });
    effect(() => {
      this.recordingService.cameraPos.set(this.cameraPos());
    });
    effect(() => {
      this.recordingService.cameraSize.set(this.cameraSize());
    });
    effect(() => {
      this.recordingService.showBorder.set(this.showBorder());
    });
    effect(() => {
      this.recordingService.borderColor.set(this.borderColor());
    });
    effect(() => {
      this.recordingService.zoomScale.set(this.zoomScale());
    });
    effect(() => {
      this.recordingService.zoomCenter.set(this.zoomCenter());
    });
    effect(() => {
      this.recordingService.cameraShape.set(this.cameraShape());
    });

    // Auto-update frame size based on screen share stream resolution to keep preview in perfect fit
    effect(() => {
      const stream = this.screenShareStream();
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) {
          const updateSize = () => {
            const settings = track.getSettings();
            if (settings.width && settings.height) {
              this.frameWidth.set(settings.width);
              this.frameHeight.set(settings.height);
            }
          };
          updateSize();
          
          track.onended = () => {
            this.frameWidth.set(this.defaultWidth);
            this.frameHeight.set(this.defaultHeight);
          };
        }
      } else {
        this.frameWidth.set(this.defaultWidth);
        this.frameHeight.set(this.defaultHeight);
      }
    });
  }


  @HostListener('window:resize')
  updateCachedWindowSize() {
      if (typeof window !== 'undefined') {
          this.cachedWindowWidth = window.innerWidth;
          this.cachedWindowHeight = window.innerHeight;
          this.recordingService.cachedWindowWidth.set(window.innerWidth);
          this.recordingService.cachedWindowHeight.set(window.innerHeight);
      }
  }

  setQualityPreset(preset: 'high' | 'medium' | 'low') {
      this.tempQualityPreset.set(preset);
  }

  openSettingsModal() {
      this.settingsService.syncTempFromSettings();
      this.showSettingsModal.set(true);
  }

  saveSettings() {
      this.settingsService.saveSettings();
      this.showSettingsModal.set(false);
      this.toastService.success(this.lang.translations().MSG_SETTINGS_SAVED);
  }

  resetToDefaultSettings() {
      this.settingsService.resetToDefault();
      this.showSettingsModal.set(false);
      this.toastService.success(this.lang.translations().MSG_SETTINGS_RESET);
  }

  updateCameraSize(event: Event) {
      const input = event.target as HTMLInputElement;
      this.tempCameraSize.set(Number(input.value));
  }

  async ngOnInit() {
      if (typeof window !== 'undefined') {
          // Parse query params for width and height (ScreenPal style)
          const urlParams = new URLSearchParams(window.location.search);
          const w = urlParams.get('width');
          const h = urlParams.get('height');
          if (w) {
              this.frameWidth.set(Number(w));
              this.defaultWidth = Number(w);
          }
          if (h) {
              this.frameHeight.set(Number(h));
              this.defaultHeight = Number(h);
          }

          this.updateCachedWindowSize();

          const initCamSize = this.cameraSize();
          const initCamHeight = this.cameraShape() === 'circle' ? initCamSize : (initCamSize * 9 / 16);
          this.cameraPos.set({ 
              x: this.cachedWindowWidth - initCamSize - APP_CONFIG.CONSTRAINTS.CAMERA_EDGE_PADDING, 
              y: this.cachedWindowHeight - initCamHeight - APP_CONFIG.CONSTRAINTS.CAMERA_EDGE_PADDING 
          });
      }
      
      await this.deviceDetector.initPermissions();
  }

  // Snapping webcam to 3x3 positions (ScreenPal PIP overlay style)
  setWebcamPresetPosition(posName: string) {
    const size = this.cameraSize();
    const camHeight = this.cameraShape() === 'circle' ? size : (size * 9 / 16);
    const pad = APP_CONFIG.CONSTRAINTS.CAMERA_EDGE_PADDING;
    const w = this.cachedWindowWidth;
    const h = this.cachedWindowHeight;
    let x = pad;
    let y = pad;

    switch (posName) {
      case 'top-left':
        x = pad;
        y = pad;
        break;
      case 'top-center':
        x = (w - size) / 2;
        y = pad;
        break;
      case 'top-right':
        x = w - size - pad;
        y = pad;
        break;
      case 'middle-left':
        x = pad;
        y = (h - camHeight) / 2;
        break;
      case 'middle-center':
        x = (w - size) / 2;
        y = (h - camHeight) / 2;
        break;
      case 'middle-right':
        x = w - size - pad;
        y = (h - camHeight) / 2;
        break;
      case 'bottom-left':
        x = pad;
        y = h - camHeight - pad;
        break;
      case 'bottom-center':
        x = (w - size) / 2;
        y = h - camHeight - pad;
        break;
      case 'bottom-right':
        x = w - size - pad;
        y = h - camHeight - pad;
        break;
    }
    this.cameraPos.set({ x, y });
    this.showPipGrid.set(false);
  }

  // Zoom modes (ScreenPal scale composite support)
  handleFrameClick(e: MouseEvent) {
    if (this.isZoomMode()) {
      const container = e.currentTarget as HTMLElement;
      const rect = container.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;

      if (this.zoomScale() > 1.0) {
        this.resetZoom();
      } else {
        this.zoomCenter.set({ x: px, y: py });
        this.zoomScale.set(2.0);
      }
    }
  }

  resetZoom() {
    this.zoomScale.set(1.0);
    this.zoomCenter.set({ x: 0.5, y: 0.5 });
  }

  // Drawing canvas helper functions
  private drawingCtx: CanvasRenderingContext2D | null = null;
  private isDrawing = false;
  private lastPos = { x: 0, y: 0 };

  getCanvasCoordinates(e: MouseEvent | Touch, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  startDrawing(e: MouseEvent) {
    if (!this.isDrawingMode()) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    this.drawingCtx = canvas.getContext('2d');
    if (!this.drawingCtx) return;
    
    this.isDrawing = true;
    this.drawingCtx.lineCap = 'round';
    this.drawingCtx.lineJoin = 'round';
    this.lastPos = this.getCanvasCoordinates(e, canvas);
  }

  draw(e: MouseEvent) {
    if (!this.isDrawing || !this.isDrawingMode() || !this.drawingCtx) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const currentPos = this.getCanvasCoordinates(e, canvas);

    this.drawingCtx.beginPath();
    this.drawingCtx.moveTo(this.lastPos.x, this.lastPos.y);
    this.drawingCtx.lineTo(currentPos.x, currentPos.y);

    if (this.currentDrawTool() === 'eraser') {
      this.drawingCtx.globalCompositeOperation = 'destination-out';
      this.drawingCtx.lineWidth = this.currentBrushSize() * 2.5;
    } else {
      this.drawingCtx.globalCompositeOperation = 'source-over';
      this.drawingCtx.strokeStyle = this.currentDrawColor();
      this.drawingCtx.lineWidth = this.currentBrushSize();
    }

    this.drawingCtx.stroke();
    this.lastPos = currentPos;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  startDrawingTouch(e: TouchEvent) {
    if (!this.isDrawingMode() || e.touches.length === 0) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    this.drawingCtx = canvas.getContext('2d');
    if (!this.drawingCtx) return;

    this.isDrawing = true;
    this.drawingCtx.lineCap = 'round';
    this.drawingCtx.lineJoin = 'round';

    const touch = e.touches[0];
    this.lastPos = this.getCanvasCoordinates(touch, canvas);
    e.preventDefault();
  }

  drawTouch(e: TouchEvent) {
    if (!this.isDrawing || !this.isDrawingMode() || !this.drawingCtx || e.touches.length === 0) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const touch = e.touches[0];
    const currentPos = this.getCanvasCoordinates(touch, canvas);

    this.drawingCtx.beginPath();
    this.drawingCtx.moveTo(this.lastPos.x, this.lastPos.y);
    this.drawingCtx.lineTo(currentPos.x, currentPos.y);

    if (this.currentDrawTool() === 'eraser') {
      this.drawingCtx.globalCompositeOperation = 'destination-out';
      this.drawingCtx.lineWidth = this.currentBrushSize() * 2.5;
    } else {
      this.drawingCtx.globalCompositeOperation = 'source-over';
      this.drawingCtx.strokeStyle = this.currentDrawColor();
      this.drawingCtx.lineWidth = this.currentBrushSize();
    }

    this.drawingCtx.stroke();
    this.lastPos = currentPos;
    e.preventDefault();
  }

  clearCanvas() {
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  formattedTime = computed(() => {
    const t = this.recordingTime();
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = (t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  ngOnDestroy() {
     this.cleanupStreams();
  }

  toggleMute() {
     this.recordingService.toggleMute();
  }

  async toggleRecording() {
     if (this.isRecording() || this.isCountingDown()) {
         this.stopRecording();
     } else {
         await this.startRecording();
     }
  }

  handleKeydown(event: KeyboardEvent) {
    if (event.code === 'Space') {
       if (event.target instanceof HTMLButtonElement) {
          return; 
       }
       event.preventDefault();
       this.toggleRecording();
    }
  }

  async toggleCamera() {
      if (this.isCameraEnabled()) {
          this.cameraStream()?.getTracks().forEach(t => t.stop());
          this.cameraStream.set(null);
          this.isCameraEnabled.set(false);
          this.cameraError.set(null);
      } else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ 
                  video: { 
                      width: { ideal: 640 }, 
                      height: { ideal: 480 }, 
                      frameRate: { ideal: 30 },
                      facingMode: 'user' 
                  } 
              });

              // Tạo một track audio im lặng bằng Web Audio để ngăn chặn việc Chromium tối ưu hóa (throttling/suspending) video ở background sau 1 phút
              try {
                  const audioCtx = new AudioContext();
                  const silenceDest = audioCtx.createMediaStreamDestination();
                  const silentTrack = silenceDest.stream.getAudioTracks()[0];
                  if (silentTrack) {
                      stream.addTrack(silentTrack);
                  }
              } catch (e) {
                  console.error('Không thể tự động tiêm track im lặng:', e);
              }

              this.cameraStream.set(stream);
              this.isCameraEnabled.set(true);
              this.deviceDetector.cameraPermission.set('granted');
              this.cameraError.set(null);
              this.deviceDetector.checkCameraStatus();
              
              // Cập nhật lại srcObject sau khi view render
              setTimeout(() => {
                  const videoEle = document.getElementById('camPreview') as HTMLVideoElement;
                  if (videoEle) {
                      videoEle.srcObject = stream;
                      videoEle.muted = false; // Đảm bảo không bị tắt tiếng để tránh bị đóng băng video trong tab nền
                      videoEle.volume = 0.001; // Sử dụng âm lượng siêu nhỏ (thực tế im lặng tuyệt đối vì track chứa silence)
                  }
              }, 50);
          } catch (err) {
              const errorName = (err instanceof Error) ? err.name : '';
              if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
                  this.deviceDetector.cameraPermission.set('denied');
              }
              this.cameraError.set('Camera không khả dụng hoặc bị chặn');
              this.deviceDetector.checkCameraStatus();
          }
      }
  }

  async startRecording() {
    await this.recordingService.startRecording({
        isCameraEnabled: this.isCameraEnabled(),
        cameraStream: this.cameraStream(),
        cameraPos: this.cameraPos(),
        cameraSize: this.cameraSize(),
        cameraShape: this.cameraShape(),
        qualityPreset: this.qualityPreset(),
        fpsPreset: this.fpsPreset(),
        cachedWindowWidth: this.cachedWindowWidth,
        cachedWindowHeight: this.cachedWindowHeight,
        showBorder: this.showBorder(),
        borderColor: this.borderColor()
    });
  }

  stopRecording() {
      this.recordingService.stopRecording();
  }

  private cleanupStreams() {
      if (this.cameraStream()) {
          this.cameraStream()!.getTracks().forEach(t => t.stop());
          this.cameraStream.set(null);
          this.isCameraEnabled.set(false);
      }
      this.recordingService.cleanupStreams();
  }
}


