# frozen_string_literal: true

require "json"
require "fileutils"
require "open3"

namespace :tts do
  desc "Edge TTS로 음성 파일 생성 (LOCALE=ko 로 특정 언어만 가능)"
  task generate: :environment do
    config = YAML.load_file(Rails.root.join("config", "tts_voices.yml"))

    target_locale = ENV["LOCALE"]
    force = ENV["FORCE"] == "true"
    score_min = config.dig("generation", "score_min") || 0
    score_max = config.dig("generation", "score_max") || 50
    countdown_numbers = config.dig("generation", "countdown") || [ 1, 2, 3, 4, 5 ]

    total_generated = 0
    total_skipped = 0
    total_failed = 0

    config["voices"].each do |lang, voice_config|
      next if target_locale.present? && lang != target_locale

      voice = voice_config["voice"]
      output_dir = Rails.root.join("public", "audio", "tts", lang)
      FileUtils.mkdir_p(output_dir)

      puts "\n🔊 [#{lang}] 음성 생성 시작 (voice: #{voice})"

      # 1) 숫자 파일 (0~50)
      (score_min..score_max).each do |n|
        text = number_to_speech_text(lang, voice_config, n)
        path = output_dir.join("#{n}.mp3")
        if !force && File.exist?(path)
          total_skipped += 1
          next
        end
        if generate_edge_tts(voice, text, path)
          total_generated += 1
        else
          total_failed += 1
        end
      end

      # 2) 접속사 파일
      connector = voice_config["connector"]
      vs_path = output_dir.join("vs.mp3")
      if force || !File.exist?(vs_path)
        if generate_edge_tts(voice, connector, vs_path)
          total_generated += 1
        else
          total_failed += 1
        end
      else
        total_skipped += 1
      end

      # 3) 카운트다운 파일 (1~5)
      countdown_numbers.each do |n|
        text = countdown_text(lang, voice_config, n)
        path = output_dir.join("countdown_#{n}.mp3")
        if !force && File.exist?(path)
          total_skipped += 1
          next
        end
        if generate_edge_tts(voice, text, path)
          total_generated += 1
        else
          total_failed += 1
        end
      end

      puts "\n   ✅ [#{lang}] 완료"
    end

    puts "\n📊 결과: #{total_generated}개 생성, #{total_skipped}개 스킵, #{total_failed}개 실패"
  end

  desc "생성된 TTS 파일 통계 확인"
  task stats: :environment do
    tts_dir = Rails.root.join("public", "audio", "tts")
    unless Dir.exist?(tts_dir)
      puts "📁 TTS 파일 없음 (rails tts:generate 를 먼저 실행하세요)"
      next
    end

    total_files = 0
    total_size = 0

    Dir.glob(tts_dir.join("*")).sort.each do |lang_dir|
      next unless File.directory?(lang_dir)

      lang = File.basename(lang_dir)
      files = Dir.glob(File.join(lang_dir, "*.mp3"))
      size = files.sum { |f| File.size(f) }
      total_files += files.count
      total_size += size
      puts "  #{lang}: #{files.count}개 파일 (#{(size / 1024.0).round(1)} KB)"
    end

    puts "\n📊 총: #{total_files}개 파일 (#{(total_size / 1024.0).round(1)} KB)"
  end
end

def number_to_speech_text(lang, voice_config, number)
  if voice_config["numbers_style"] == "sino_korean"
    to_sino_korean(number)
  elsif lang == "zh"
    to_chinese_number(number)
  else
    number.to_s
  end
end

def countdown_text(_lang, voice_config, number)
  number_to_speech_text(_lang, voice_config, number)
end

def to_sino_korean(number)
  return "영" if number == 0

  digits = [ "", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구" ]
  hundreds = number / 100
  tens = (number % 100) / 10
  ones = number % 10
  result = ""

  result += hundreds == 1 ? "백" : "#{digits[hundreds]}백" if hundreds > 0
  result += tens == 1 ? "십" : "#{digits[tens]}십" if tens > 0
  result += digits[ones] if ones > 0

  result
end

def to_chinese_number(number)
  return "零" if number == 0

  digits = [ "", "一", "二", "三", "四", "五", "六", "七", "八", "九" ]
  tens = number / 10
  ones = number % 10
  result = ""

  if tens > 0
    result += digits[tens] unless tens == 1
    result += "十"
  end
  result += digits[ones] if ones > 0

  result
end

# edge-tts CLI로 음성 파일 생성
def generate_edge_tts(voice, text, output_path)
  edge_tts_cmd = @edge_tts_path ||= find_edge_tts
  stdout, stderr, status = Open3.capture3(
    edge_tts_cmd, "--voice", voice, "--text", text, "--write-media", output_path.to_s
  )

  if status.success? && File.exist?(output_path) && File.size(output_path) > 0
    print "."
    true
  else
    puts "\n   ❌ 실패: \"#{text}\" #{stderr}"
    File.delete(output_path) if File.exist?(output_path)
    false
  end
rescue StandardError => e
  puts "\n   ❌ 에러: \"#{text}\" (#{e.message})"
  false
end

def find_edge_tts
  # which로 탐색
  which_result = `which edge-tts 2>/dev/null`.strip
  return which_result unless which_result.empty?

  # pip3 install 경로 탐색
  home = ENV["HOME"]
  candidates = [
    "#{home}/Library/Python/3.9/bin/edge-tts",
    "#{home}/Library/Python/3.10/bin/edge-tts",
    "#{home}/Library/Python/3.11/bin/edge-tts",
    "#{home}/Library/Python/3.12/bin/edge-tts",
    "#{home}/.local/bin/edge-tts",
    "/usr/local/bin/edge-tts"
  ]
  candidates.each { |p| return p if File.executable?(p) }

  abort "❌ edge-tts를 찾을 수 없습니다. pip3 install edge-tts"
end
