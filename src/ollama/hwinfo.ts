import os from "os";
import { execSync } from "child_process";

export interface HardwareInfo {
  cpu: string;
  cores: number;
  ramGB: number;
  freeRamGB: number;
  vramGB: number | null;
  gpu: string | null;
  diskFreeGB: number;
  platform: string;
}

function execSafe(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    return "";
  }
}

function getGPUInfo(): { name: string | null; vramGB: number | null } {
  if (os.platform() === "win32") {
    const out = execSafe("wmic path win32_VideoController get name,adapterram /format:csv");
    for (const line of out.split("\n").slice(1)) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 3 && parts[2]) {
        const name = parts[2];
        const vramBytes = parseInt(parts[1], 10);
        return {
          name,
          vramGB: isNaN(vramBytes) ? null : Math.round(vramBytes / 1073741824),
        };
      }
    }
  }

  const nvidia = execSafe("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader");
  if (nvidia) {
    const parts = nvidia.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      const vramMatch = parts[1].match(/([\d.]+)/);
      return {
        name: parts[0],
        vramGB: vramMatch ? Math.round(parseFloat(vramMatch[1])) : null,
      };
    }
  }

  return { name: null, vramGB: null };
}

function getDiskFreeGB(): number {
  try {
    if (os.platform() === "win32") {
      const out = execSafe("wmic logicaldisk where name='C:' get freespace /format:csv");
      const bytes = parseInt(out.split("\n").filter(Boolean).pop() || "", 10);
      if (!isNaN(bytes)) return Math.round(bytes / 1073741824);
    } else {
      const out = execSafe("df -k .");
      const parts = out.split("\n").filter(Boolean).pop()?.split(/\s+/);
      if (parts && parts.length >= 4) return Math.round(parseInt(parts[3], 10) / 1048576);
    }
  } catch { /* fallback */ }
  return Math.round(os.freemem() / 1073741824);
}

export function getHardwareInfo(): HardwareInfo {
  const cpus = os.cpus();
  const gpu = getGPUInfo();
  return {
    cpu: cpus.length > 0 ? cpus[0].model.trim() : "Unknown",
    cores: cpus.length,
    ramGB: Math.round(os.totalmem() / 1073741824),
    freeRamGB: Math.round(os.freemem() / 1073741824),
    vramGB: gpu.vramGB,
    gpu: gpu.name,
    diskFreeGB: getDiskFreeGB(),
    platform: `${os.platform()} ${os.release()}`,
  };
}
