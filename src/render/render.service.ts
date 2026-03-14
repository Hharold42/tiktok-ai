import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

type GenerationPayload = {
  generationId: string;
  durationSec: number;
  keywords: string[];
  assets: Array<{ keyword: string; videos: any[] }>;
  tts?: {
    filePath?: string;
    alignment?: {
      characters: string[];
      characterStartTimesSeconds: number[];
      characterEndTimesSeconds: number[];
    } | null;
    normalizedAlignment?: {
      characters: string[];
      characterStartTimesSeconds: number[];
      characterEndTimesSeconds: number[];
    } | null;
  };
  voiceover?: string;
};

@Injectable()
export class RenderService {
  private readonly ffmpegPath: string;

  // constructor() {
  //   const localPath =
  //     'C:\\Users\\torbe\\Downloads\\ffmpeg-8.0.1-full_build\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe';

  //   this.ffmpegPath = existsSync(localPath) ? localPath : 'ffmpeg';
  // }

  constructor() {
    this.ffmpegPath = this.determineFfmpegPath();
    console.log(`Using ffmpeg at: ${this.ffmpegPath}`); 
  }

  private determineFfmpegPath(): string {
    const possiblePaths = [
      '/usr/bin/ffmpeg',           
      '/usr/local/bin/ffmpeg',     
      'ffmpeg',                    
    ];

    const windowsPath = 'C:\\Users\\torbe\\Downloads\\ffmpeg-8.0.1-full_build\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe';

    if (process.platform === 'win32' && existsSync(windowsPath)) {
      return windowsPath;
    }

    for (const path of possiblePaths) {
      if (path === 'ffmpeg' || existsSync(path)) {
        return path;
      }
    }

    return 'ffmpeg';
  }

  async renderLatestOr(id?: string) {
    const payload = await this.loadPayload(id);
    await this.ensureFfmpeg();

    const resourcesDir = join(process.cwd(), 'resources', payload.generationId);
    const resultDir = join(process.cwd(), 'result', payload.generationId);
    const clipsDir = join(resourcesDir, 'clips');
    await mkdir(clipsDir, { recursive: true });
    await mkdir(resultDir, { recursive: true });

    const scenes = this.buildScenes(payload);
    const downloaded = await this.downloadClips(scenes, clipsDir);
    if (downloaded.length === 0) {
      throw new InternalServerErrorException('No clips available to render');
    }

    const segmentFiles = await this.cutSegments(downloaded, resultDir, scenes);
    const concatListPath = join(resultDir, 'concat.txt');
    await writeFile(
      concatListPath,
      segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    );

    const concatPath = join(resultDir, 'video.mp4');
    await this.runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      concatPath,
    ]);

    const finalPath = join(resultDir, 'final.mp4');
    if (payload.tts?.filePath) {
      if (!existsSync(payload.tts.filePath)) {
        throw new InternalServerErrorException(`TTS file not found: ${payload.tts.filePath}`);
      }
      await this.runFfmpeg([
        '-y',
        '-i',
        concatPath,
        '-i',
        payload.tts.filePath,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-shortest',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        finalPath,
      ]);
    } else {
      await this.copyFile(concatPath, finalPath);
    }

    const subtitlePath = await this.maybeWriteSubtitles(payload, resultDir);
    const finalWithSubsPath = join(resultDir, 'final_subs.mp4');
    if (subtitlePath) {
      await this.runFfmpeg([
        '-y',
        '-i',
        finalPath,
        '-vf',
        `subtitles=${this.escapeFilterPath(subtitlePath)}:force_style='FontName=Arial,FontSize=48,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=60'`,
        '-c:a',
        'copy',
        finalWithSubsPath,
      ]);
      await writeFile(join(process.cwd(), 'result', 'latest.mp4'), await readFile(finalWithSubsPath));
    } else {
      await writeFile(join(process.cwd(), 'result', 'latest.mp4'), await readFile(finalPath));
    }

    return {
      generationId: payload.generationId,
      scenes,
      finalPath: subtitlePath ? finalWithSubsPath : finalPath,
      subtitles: subtitlePath ?? null,
    };
  }

  private async loadPayload(id?: string): Promise<GenerationPayload> {
    const base = id
      ? join(process.cwd(), 'resources', id, 'generation.json')
      : join(process.cwd(), 'resources', 'latest.json');
    const raw = await readFile(base, 'utf-8');
    return JSON.parse(raw) as GenerationPayload;
  }

  private buildScenes(payload: GenerationPayload) {
    const count = Math.max(1, Math.min(payload.keywords.length || 1, payload.assets.length || 1));
    const duration = Math.max(3, Math.floor(payload.durationSec / count));

    const scenes: Array<{ index: number; keyword: string; duration: number; video: any }> = [];
    for (let i = 0; i < count; i += 1) {
      const keyword = payload.keywords[i] ?? payload.keywords[0];
      const assetGroup = payload.assets.find((a) => a.keyword === keyword) ?? payload.assets[i];
      const video = this.pickVideo(assetGroup?.videos ?? []);
      scenes.push({
        index: i,
        keyword,
        duration,
        video,
      });
    }
    return scenes;
  }

  private async downloadClips(
    scenes: Array<{ index: number; keyword: string; duration: number; video: any }>,
    clipsDir: string,
  ) {
    const downloads: Array<{ path: string; duration: number }> = [];

    for (const scene of scenes) {
      if (!scene.video) continue;
      const file = this.pickVideoFile(scene.video);
      if (!file?.link) continue;

      const path = join(clipsDir, `clip_${scene.index}.mp4`);
      const res = await fetch(file.link);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(path, buffer);
      downloads.push({ path, duration: scene.duration });
    }

    return downloads;
  }

  private pickVideo(videos: any[]) {
    if (!Array.isArray(videos) || videos.length === 0) return null;
    return videos[0];
  }

  private pickVideoFile(video: any) {
    if (!video?.video_files?.length) return null;
    const mp4 = video.video_files.filter((f: any) => String(f.file_type).includes('mp4'));
    const sorted = mp4.sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0));
    return sorted[0] ?? mp4[0];
  }

  private async cutSegments(
    downloads: Array<{ path: string; duration: number }>,
    resultDir: string,
    scenes: Array<{ index: number; duration: number }>,
  ) {
    const outputs: string[] = [];
    for (let i = 0; i < downloads.length; i += 1) {
      const input = downloads[i];
      const out = join(resultDir, `segment_${i}.mp4`);
      const duration = scenes[i]?.duration ?? input.duration;
      await this.runFfmpeg([
        '-y',
        '-i',
        input.path,
        '-t',
        String(duration),
        '-vf',
        'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        out,
      ]);
      outputs.push(out);
    }
    return outputs;
  }

  private async ensureFfmpeg() {
    try {
      await this.runFfmpeg(['-version']);
    } catch {
      throw new InternalServerErrorException(
        `ffmpeg not found. Tried: ${this.ffmpegPath}. If you just updated PATH, restart the terminal/server.`,
      );
    }
  }

  private runFfmpeg(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, args, { stdio: 'ignore' });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit code ${code}`));
      });
    });
  }

  private async copyFile(src: string, dest: string) {
    const data = await readFile(src);
    await writeFile(dest, data);
  }

  private async maybeWriteSubtitles(payload: GenerationPayload, resultDir: string) {
    const alignment = payload.tts?.alignment ?? payload.tts?.normalizedAlignment ?? null;
    const text = (payload.voiceover ?? '').trim();
    if (!text) return null;

    const lines: string[] = [];

    if (alignment?.characters?.length) {
      const chunks = this.buildAlignedChunks(alignment);
      chunks.forEach((c, i) => {
        lines.push(String(i + 1));
        lines.push(`${this.toSrtTime(c.start)} --> ${this.toSrtTime(c.end)}`);
        lines.push(c.text);
        lines.push('');
      });
    } else {
      const sentences = this.splitSentences(text);
      if (sentences.length === 0) return null;

      const total = Math.max(1, payload.durationSec || 1);
      const per = total / sentences.length;
      let start = 0;

      sentences.forEach((s, i) => {
        const end = i === sentences.length - 1 ? total : start + per;
        lines.push(String(i + 1));
        lines.push(`${this.toSrtTime(start)} --> ${this.toSrtTime(end)}`);
        lines.push(s);
        lines.push('');
        start = end;
      });
    }

    const subtitlePath = join(resultDir, 'subtitles.srt');
    await writeFile(subtitlePath, lines.join('\n'));
    return subtitlePath;
  }

  private splitSentences(text: string) {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private buildAlignedChunks(alignment: {
    characters: string[];
    characterStartTimesSeconds: number[];
    characterEndTimesSeconds: number[];
  }) {
    const { characters, characterStartTimesSeconds, characterEndTimesSeconds } = alignment;
    const chunks: Array<{ text: string; start: number; end: number }> = [];
    let buffer = '';
    let chunkStart = 0;
    let chunkEnd = 0;

    for (let i = 0; i < characters.length; i += 1) {
      const ch = characters[i];
      const start = characterStartTimesSeconds[i] ?? chunkEnd;
      const end = characterEndTimesSeconds[i] ?? start;

      if (!buffer) {
        chunkStart = start;
      }

      buffer += ch;
      chunkEnd = end;

      if (ch === ' ' || ch === '\n' || buffer.length >= 42) {
        const text = buffer.trim();
        if (text) {
          chunks.push({ text, start: chunkStart, end: chunkEnd });
        }
        buffer = '';
      }
    }

    const tail = buffer.trim();
    if (tail) {
      chunks.push({ text: tail, start: chunkStart, end: chunkEnd });
    }

    return chunks;
  }

  private toSrtTime(seconds: number) {
    const s = Math.max(0, seconds);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    const ms = Math.floor((s - Math.floor(s)) * 1000);
    return `${this.pad(hh)}:${this.pad(mm)}:${this.pad(ss)},${this.pad(ms, 3)}`;
  }

  private pad(num: number, size = 2) {
    return String(num).padStart(size, '0');
  }

  private escapeFilterPath(filePath: string) {
    return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
  }
}
