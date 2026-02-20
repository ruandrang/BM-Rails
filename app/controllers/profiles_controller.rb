class ProfilesController < ApplicationController
  def edit
    @user = current_user
  end

  def update
    @user = current_user
    if @user.update(profile_params)
      redirect_to clubs_path, notice: I18n.t("auth.notices.profile_updated", default: "프로필이 저장되었습니다.")
    else
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def profile_params
    params.require(:user).permit(:nickname, :avatar_url)
  end
end
