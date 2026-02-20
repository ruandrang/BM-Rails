require "omniauth-oauth2"

module OmniAuth
  module Strategies
    class Kakao < OmniAuth::Strategies::OAuth2
      option :name, "kakao"

      option :client_options, {
        site: "https://kauth.kakao.com",
        authorize_url: "/oauth/authorize",
        token_url: "/oauth/token",
        auth_scheme: :request_body
      }

      uid { raw_info["id"].to_s }

      info do
        {
          name: kakao_account.dig("profile", "nickname"),
          email: kakao_account["email"],
          image: kakao_account.dig("profile", "profile_image_url"),
          nickname: kakao_account.dig("profile", "nickname")
        }
      end

      extra do
        { raw_info: raw_info }
      end

      def raw_info
        @raw_info ||= access_token.get("https://kapi.kakao.com/v2/user/me").parsed
      end

      private

      def kakao_account
        raw_info.fetch("kakao_account", {})
      end

      def callback_url
        full_host + callback_path
      end
    end
  end
end
