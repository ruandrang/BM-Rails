class OmniauthCallbacksController < ApplicationController
  skip_before_action :require_login
  skip_before_action :verify_authenticity_token, only: [ :create ]

  def create
    user = OmniauthUserFinder.new(auth_hash).call
    session[:user_id] = user.id

    if user.previously_new_record?
      redirect_to edit_profile_path, notice: I18n.t("auth.notices.welcome_setup", default: "환영합니다! 프로필을 설정해주세요.")
    else
      redirect_to clubs_path, notice: I18n.t("auth.notices.logged_in", default: "로그인되었습니다.")
    end
  rescue StandardError => e
    details = e.respond_to?(:record) ? e.record.errors.full_messages.join(", ") : e.message
    Rails.logger.error("OAuth 로그인 실패: #{e.class} - #{details}")
    redirect_to new_session_path, alert: I18n.t("auth.errors.oauth_failed", default: "소셜 로그인에 실패했습니다. 다시 시도해주세요.")
  end

  def failure
    redirect_to new_session_path, alert: I18n.t("auth.errors.oauth_failed", default: "소셜 로그인에 실패했습니다. 다시 시도해주세요.")
  end

  private

  def auth_hash
    request.env["omniauth.auth"]
  end
end
